import { SkycodeMessage } from "@shared/ExtensionMessage"
import { useCallback, useEffect, useRef, useState } from "react"
import { ListRange, VirtuosoHandle } from "react-virtuoso"
import { ScrollBehavior } from "../types/chatTypes"
import { TurnData } from "../utils/messageUtils"

/**
 * Hook for chat scroll management with Turn-based data.
 *
 * Key design:
 * - Virtuoso data = TurnData[] (each turn = one user message + AI responses).
 * - Sticky headers are pure CSS (`position: sticky` on TurnBlock header) — no JS hacks.
 * - Footer is always 100vh — never changes — no Virtuoso re-layout jumps.
 * - Auto-scroll uses pixel-based calculation to scroll to content bottom (not into footer).
 * - After user sends a message, scrollToIndex(lastTurn, "start") pins it to the top.
 * - Custom "at bottom" detection accounts for the large footer.
 */
export function useScrollBehavior(
	messages: SkycodeMessage[],
	_visibleMessages: SkycodeMessage[],
	turns: TurnData[],
	expandedRows: Record<number, boolean>,
	setExpandedRows: React.Dispatch<React.SetStateAction<Record<number, boolean>>>,
): ScrollBehavior & {
	showScrollToBottom: boolean
	setShowScrollToBottom: React.Dispatch<React.SetStateAction<boolean>>
	isAtBottom: boolean
	setIsAtBottom: React.Dispatch<React.SetStateAction<boolean>>
	pendingScrollToMessage: number | null
	setPendingScrollToMessage: React.Dispatch<React.SetStateAction<number | null>>
	handleRangeChanged: (range: ListRange) => void
} {
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)

	const scrollerElementRef = useRef<HTMLElement | null>(null)

	// Track scrollHeight in the scroll handler to distinguish user scroll from content growth.
	const prevScrollHeightForHandlerRef = useRef(0)

	// Flag: set when pinning a new turn to top, cleared after layout settles.
	const isPinningRef = useRef(false)

	const turnsRef = useRef(turns)
	turnsRef.current = turns

	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(false)
	const [pendingScrollToMessage, setPendingScrollToMessage] = useState<number | null>(null)
	const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)

	const handleRangeChanged = useCallback((_range: ListRange) => {}, [])

	// ==================== Pixel-based auto-scroll ====================
	const prevScrollHeightRef = useRef(0)
	const scrollFollowRafRef = useRef<number | null>(null)

	const getFooterPixels = useCallback(() => window.innerHeight, [])

	const getContentMaxScroll = useCallback(() => {
		const scroller = scrollerElementRef.current
		if (!scroller) return 0
		return Math.max(0, scroller.scrollHeight - getFooterPixels() - scroller.clientHeight)
	}, [getFooterPixels])

	const scrollToContentBottom = useCallback(
		(behavior: "smooth" | "auto", forShrink = false) => {
			if (isPinningRef.current) return
			if (!forShrink && disableAutoScrollRef.current) return

			const scroller = scrollerElementRef.current
			if (!scroller) {
				const lastIndex = turnsRef.current.length - 1
				if (lastIndex >= 0) {
					virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: "end", behavior })
				}
				return
			}

			const maxScroll = getContentMaxScroll()
			const curScrollHeight = scroller.scrollHeight

			if (forShrink) {
				if (scroller.scrollTop > maxScroll) {
					scroller.scrollTop = maxScroll
				}
			} else {
				const prevHeight = prevScrollHeightRef.current
				const heightDelta = curScrollHeight - prevHeight

				if (heightDelta > 0 && maxScroll > scroller.scrollTop) {
					const newTop = Math.min(scroller.scrollTop + heightDelta, maxScroll)
					scroller.scrollTo({ top: newTop, behavior })
				}
			}
			prevScrollHeightRef.current = curScrollHeight
		},
		[getContentMaxScroll],
	)

	const scrollToBottomSmooth = useCallback(() => {
		if (scrollFollowRafRef.current != null) return
		scrollFollowRafRef.current = requestAnimationFrame(() => {
			scrollFollowRafRef.current = null
			scrollToContentBottom("auto")
		})
	}, [scrollToContentBottom])

	useEffect(
		() => () => {
			if (scrollFollowRafRef.current != null) {
				cancelAnimationFrame(scrollFollowRafRef.current)
			}
		},
		[],
	)

	const scrollToBottomAuto = useCallback(() => {
		disableAutoScrollRef.current = false
		const scroller = scrollerElementRef.current
		if (scroller) {
			const maxScroll = getContentMaxScroll()
			scroller.scrollTo({ top: maxScroll, behavior: "auto" })
			prevScrollHeightRef.current = scroller.scrollHeight
		} else {
			scrollToContentBottom("auto")
		}
	}, [getContentMaxScroll, scrollToContentBottom])

	// ==================== scrollToMessage ====================
	const scrollToMessage = useCallback(
		(messageIndex: number) => {
			const targetMessage = messages[messageIndex]
			if (!targetMessage) {
				setPendingScrollToMessage(null)
				return
			}

			let turnIndex = -1
			for (let t = 0; t < turns.length; t++) {
				const turn = turns[t]
				if (turn.userMessage.ts === targetMessage.ts) {
					turnIndex = t
					break
				}
				for (const item of turn.items) {
					if (Array.isArray(item)) {
						if (item.some((m) => m.ts === targetMessage.ts)) {
							turnIndex = t
							break
						}
					} else if (item.ts === targetMessage.ts) {
						turnIndex = t
						break
					}
				}
				if (turnIndex !== -1) break
			}

			if (turnIndex !== -1) {
				setPendingScrollToMessage(null)
				disableAutoScrollRef.current = true

				requestAnimationFrame(() => {
					virtuosoRef.current?.scrollToIndex({
						index: turnIndex,
						align: "start",
						behavior: "smooth",
					})
				})
			} else {
				setPendingScrollToMessage(null)
			}
		},
		[messages, turns],
	)

	// ==================== Expand/collapse rows ====================
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			const isCollapsing = expandedRows[ts] ?? false

			const lastTurn = turns.at(-1)
			const lastItem = lastTurn?.items.at(-1)
			const isLast = lastItem
				? Array.isArray(lastItem) ? lastItem[0]?.ts === ts : lastItem?.ts === ts
				: false

			const secondToLastItem = lastTurn?.items.at(-2)
			const isSecondToLast = secondToLastItem
				? Array.isArray(secondToLastItem) ? secondToLastItem[0]?.ts === ts : secondToLastItem?.ts === ts
				: false

			const isLastCollapsedApiReq =
				isLast &&
				!Array.isArray(lastItem) &&
				lastItem?.say === "api_req_started" &&
				!expandedRows[lastItem.ts]

			setExpandedRows((prev) => ({
				...prev,
				[ts]: !prev[ts],
			}))

			if (!isCollapsing) {
				disableAutoScrollRef.current = true
			}
			const runShrinkScroll = () => {
				requestAnimationFrame(() => {
					requestAnimationFrame(() => scrollToContentBottom("auto", true))
				})
			}
			if (isCollapsing && isAtBottom) {
				runShrinkScroll()
			} else if (isCollapsing && (isLast || isSecondToLast)) {
				if (isSecondToLast && !isLastCollapsedApiReq) {
					return
				}
				runShrinkScroll()
			}
		},
		[turns, expandedRows, scrollToContentBottom, isAtBottom, setExpandedRows],
	)

	// ==================== Row height changes ====================
	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (!disableAutoScrollRef.current) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					requestAnimationFrame(() => {
						requestAnimationFrame(() => scrollToContentBottom("auto", true))
					})
				}
			}
		},
		[scrollToBottomSmooth, scrollToContentBottom],
	)

	// ==================== New turns / new content ====================
	const prevTurnCountRef = useRef(turns.length)
	const prevMessagesLengthRef = useRef(messages.length)

	useEffect(() => {
		const prevTurnCount = prevTurnCountRef.current
		const curTurnCount = turns.length
		const prevMsgLen = prevMessagesLengthRef.current
		const curMsgLen = messages.length

		prevTurnCountRef.current = curTurnCount
		prevMessagesLengthRef.current = curMsgLen

		if (curMsgLen <= prevMsgLen) return

		if (curTurnCount > prevTurnCount) {
			isPinningRef.current = true
			disableAutoScrollRef.current = true

			const idx = turnsRef.current.length - 1
			if (idx >= 0) {
				virtuosoRef.current?.scrollToIndex({
					index: idx,
					align: "start",
					behavior: "auto",
				})
			}
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					isPinningRef.current = false
					if (scrollerElementRef.current) {
						prevScrollHeightRef.current = scrollerElementRef.current.scrollHeight
					}
					disableAutoScrollRef.current = false
				})
			})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages.length, turns.length])

	useEffect(() => {
		if (pendingScrollToMessage !== null) {
			scrollToMessage(pendingScrollToMessage)
		}
	}, [pendingScrollToMessage, turns, scrollToMessage])

	useEffect(() => {
		if (!messages?.length) {
			setShowScrollToBottom(false)
		}
	}, [messages.length])

	// ==================== Custom "at bottom" detection ====================
	const onScrollerRef = useCallback((ref: HTMLElement | Window | null) => {
		const el = ref instanceof HTMLElement ? ref : null
		scrollerElementRef.current = el
		if (el) {
			prevScrollHeightRef.current = el.scrollHeight
			prevScrollHeightForHandlerRef.current = el.scrollHeight
		}
		setScrollRoot(el)
	}, [])

	useEffect(() => {
		if (!scrollRoot) return

		prevScrollHeightForHandlerRef.current = scrollRoot.scrollHeight

		const handleScroll = () => {
			if (isPinningRef.current) return

			const { scrollTop, scrollHeight, clientHeight } = scrollRoot
			const footerPx = getFooterPixels()
			const distanceFromContent = scrollHeight - footerPx - scrollTop - clientHeight

			const turnEndVisible = distanceFromContent <= 80

			if (turnEndVisible) {
				disableAutoScrollRef.current = false
				setShowScrollToBottom(false)
			} else if (scrollHeight <= prevScrollHeightForHandlerRef.current) {
				disableAutoScrollRef.current = true
				setShowScrollToBottom(true)
			}

			prevScrollHeightForHandlerRef.current = scrollHeight
			setIsAtBottom(distanceFromContent <= 50)
		}

		scrollRoot.addEventListener("scroll", handleScroll, { passive: true })
		return () => {
			scrollRoot.removeEventListener("scroll", handleScroll)
		}
	}, [scrollRoot, getFooterPixels])

	return {
		virtuosoRef,
		scrollContainerRef,
		disableAutoScrollRef,
		scrollToBottomSmooth,
		scrollToBottomAuto,
		scrollToMessage,
		toggleRowExpansion,
		handleRowHeightChange,
		showScrollToBottom,
		setShowScrollToBottom,
		isAtBottom,
		setIsAtBottom,
		pendingScrollToMessage,
		setPendingScrollToMessage,
		handleRangeChanged,
		onScrollerRef,
	}
}
