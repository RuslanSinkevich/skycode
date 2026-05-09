import { SkycodeMessage } from "@shared/ExtensionMessage"
import { useCallback, useEffect, useRef, useState } from "react"
import { ScrollBehavior } from "../types/chatTypes"
import { TurnData } from "../utils/messageUtils"

/**
 * Native-scroll chat scroll manager — tail mode.
 *
 * Behaviour (Cursor-style):
 *   1. New user turn → pin its top to the viewport top.
 *      `scrollTop = lastTurnEl.offsetTop`. While AI streams a short answer
 *      that still fits ABOVE the viewport bottom, scrollTop stays put — the
 *      pinned user message is always on screen at the top.
 *   2. As soon as the answer overflows the viewport bottom (i.e.
 *      `scrollTop < maxScroll`), tail-mode kicks in: every content-growth
 *      tick clamps `scrollTop` to `maxScroll`, so new chunks always appear
 *      at the bottom edge of the viewport (exactly how a terminal log
 *      follows tail).
 *   3. The user scrolling/wheeling UP away from the bottom disables
 *      auto-follow (and shows the "scroll to bottom" button). Scrolling
 *      back near the bottom re-enables it.
 *   4. The bottom 100vh footer-spacer (rendered in MessagesArea) lets the
 *      pinned user message sit at viewport top even if the answer is tiny.
 *      `getContentMaxScroll()` excludes the footer so we never auto-scroll
 *      INTO empty footer space.
 *
 * Notes:
 *   - No glide animation: any per-frame interpolation made fast streams
 *     look like a 1-2s slow drift, which the user perceives as "the chat
 *     was thrown to the bottom". Direct clamp = predictable tail behaviour.
 *   - `prevScrollHeightRef` is intentionally not used to gate follow
 *     decisions; we trust the live `scrollTop < maxScroll` test instead.
 */

const NEAR_BOTTOM_PX = 80
const AT_BOTTOM_PX = 50

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
} {
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)

	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(true)
	const [pendingScrollToMessage, setPendingScrollToMessage] = useState<number | null>(null)

	// --- internal refs ---
	const scrollerRef = useRef<HTMLElement | null>(null)
	const isPinningRef = useRef(false)
	const userInteractingRef = useRef(false)
	const turnsRef = useRef(turns)
	turnsRef.current = turns
	const prevTurnCountRef = useRef(turns.length)
	const prevMessagesLengthRef = useRef(messages.length)
	const isFirstRenderRef = useRef(true)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// Grace period after a programmatic scrollTo: ignore the resulting
	// "scroll" event so it isn't misclassified as a user gesture.
	const programmaticScrollUntilRef = useRef(0)

	// ---------- helpers ----------

	const getFooterPixels = useCallback(() => window.innerHeight, [])

	const getContentMaxScroll = useCallback(
		(scroller: HTMLElement) => {
			return Math.max(0, scroller.scrollHeight - getFooterPixels() - scroller.clientHeight)
		},
		[getFooterPixels],
	)

	/** Tail-mode follow: if the answer has overflowed the viewport bottom
	 *  (scrollTop < maxScroll), clamp scrollTop to maxScroll so the new
	 *  content appears at the bottom edge. While the answer still fits
	 *  above (scrollTop >= maxScroll, which is the case right after pinning
	 *  the user message thanks to the footer-spacer), do NOTHING — keep
	 *  the user message pinned at the top. */
	const followIfOverflowing = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) return
		if (isPinningRef.current) return
		if (disableAutoScrollRef.current) return
		if (userInteractingRef.current) return

		const maxScroll = getContentMaxScroll(scroller)
		if (scroller.scrollTop < maxScroll) {
			programmaticScrollUntilRef.current = Date.now() + 80
			scroller.scrollTop = maxScroll
		}
	}, [getContentMaxScroll])

	// --- public API ---

	const scrollToBottomAuto = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) return
		disableAutoScrollRef.current = false
		setShowScrollToBottom(false)
		const maxScroll = getContentMaxScroll(scroller)
		programmaticScrollUntilRef.current = Date.now() + 80
		scroller.scrollTop = maxScroll
	}, [getContentMaxScroll])

	const scrollToBottomSmooth = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) return
		disableAutoScrollRef.current = false
		setShowScrollToBottom(false)
		const maxScroll = getContentMaxScroll(scroller)
		programmaticScrollUntilRef.current = Date.now() + 200
		scroller.scrollTo({ top: maxScroll, behavior: "smooth" })
	}, [getContentMaxScroll])

	// --- scrollToMessage ---

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
				setShowScrollToBottom(true)

				requestAnimationFrame(() => {
					const scroller = scrollerRef.current
					if (!scroller) return
					const turnEl = scroller.querySelector(`[data-turn-index="${turnIndex}"]`) as HTMLElement | null
					if (turnEl) {
						programmaticScrollUntilRef.current = Date.now() + 200
						turnEl.scrollIntoView({ block: "start", behavior: "smooth" })
					}
				})
			} else {
				setPendingScrollToMessage(null)
			}
		},
		[messages, turns],
	)

	// --- toggleRowExpansion ---

	const toggleRowExpansion = useCallback(
		(ts: number) => {
			const isCollapsing = expandedRows[ts] ?? false
			setExpandedRows((prev) => ({ ...prev, [ts]: !prev[ts] }))

			if (!isCollapsing) {
				// Expanding a row – the user is reading something specific,
				// don't auto-yank them down.
				disableAutoScrollRef.current = true
				setShowScrollToBottom(true)
			} else {
				// Collapsing → clamp scrollTop so we don't end up below the
				// new (smaller) maxScroll.
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const scroller = scrollerRef.current
						if (!scroller) return
						const maxScroll = getContentMaxScroll(scroller)
						if (scroller.scrollTop > maxScroll) {
							scroller.scrollTop = maxScroll
						}
					})
				})
			}
		},
		[expandedRows, setExpandedRows, getContentMaxScroll],
	)

	// --- handleRowHeightChange (called by the last ProcessBlock when its
	//     own ResizeObserver detects a height change). Just delegates to
	//     followIfOverflowing — we don't need separate logic here. ---

	const handleRowHeightChange = useCallback(
		(_isTaller: boolean) => {
			followIfOverflowing()
		},
		[followIfOverflowing],
	)

	// ==================== Scroller ref callback ====================

	const onScrollerRef = useCallback((ref: HTMLElement | null) => {
		scrollerRef.current = ref
	}, [])

	// ==================== User interaction detection ====================

	useEffect(() => {
		const scroller = scrollerRef.current
		if (!scroller) return

		const onWheel = (e: WheelEvent) => {
			userInteractingRef.current = true

			if (e.deltaY < 0) {
				// User scrolled up → disable follow until they return near
				// the bottom (handleScroll re-enables it).
				disableAutoScrollRef.current = true
				programmaticScrollUntilRef.current = 0
				setShowScrollToBottom(true)
			}

			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current)
			wheelTimeoutRef.current = setTimeout(() => {
				userInteractingRef.current = false
			}, 150)
		}

		const markUserInteraction = () => {
			userInteractingRef.current = true
		}
		const clearUserInteraction = () => {
			userInteractingRef.current = false
		}

		scroller.addEventListener("wheel", onWheel, { passive: true })
		scroller.addEventListener("touchstart", markUserInteraction, { passive: true })
		scroller.addEventListener("pointerdown", markUserInteraction, { passive: true })
		scroller.addEventListener("touchend", clearUserInteraction, { passive: true })
		scroller.addEventListener("pointerup", clearUserInteraction, { passive: true })

		return () => {
			scroller.removeEventListener("wheel", onWheel)
			scroller.removeEventListener("touchstart", markUserInteraction)
			scroller.removeEventListener("pointerdown", markUserInteraction)
			scroller.removeEventListener("touchend", clearUserInteraction)
			scroller.removeEventListener("pointerup", clearUserInteraction)
			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current)
		}
	}, [scrollerRef.current])

	// ==================== Scroll event — auto-scroll toggle / button ====================

	useEffect(() => {
		const scroller = scrollerRef.current
		if (!scroller) return

		const handleScroll = () => {
			if (isPinningRef.current) return
			// Ignore browser-emitted scroll events from our own scrollTo.
			if (Date.now() < programmaticScrollUntilRef.current && !userInteractingRef.current) return

			const footerPx = getFooterPixels()
			// Positive when scrollTop is ABOVE maxScroll (the answer hasn't
			// reached viewport bottom yet). Negative when scrollTop is BELOW
			// maxScroll (right after pinning a fresh turn — the footer keeps
			// scrollTop above maxScroll).
			const distanceFromContent = scroller.scrollHeight - footerPx - scroller.scrollTop - scroller.clientHeight
			const nearBottom = distanceFromContent <= NEAR_BOTTOM_PX

			if (nearBottom) {
				disableAutoScrollRef.current = false
				setShowScrollToBottom(false)
			} else if (userInteractingRef.current) {
				disableAutoScrollRef.current = true
				setShowScrollToBottom(true)
			}

			// `isAtBottom` is consumed by InputSection to decide whether a
			// growing textarea should pull the chat down. Only true when
			// scrollTop is genuinely at/near the content bottom — never
			// while the user message is freshly pinned (distance < 0).
			setIsAtBottom(distanceFromContent >= 0 && distanceFromContent <= AT_BOTTOM_PX)
		}

		scroller.addEventListener("scroll", handleScroll, { passive: true })
		return () => scroller.removeEventListener("scroll", handleScroll)
	}, [scrollerRef.current, getFooterPixels])

	// ==================== ResizeObserver — follow content growth ====================

	useEffect(() => {
		const scroller = scrollerRef.current
		if (!scroller) return

		// Observe the dedicated chat-content wrapper (added in MessagesArea
		// so growth of any turn is detected, not just the first child).
		const target = scroller.firstElementChild ?? scroller

		const ro = new ResizeObserver(() => {
			followIfOverflowing()
		})

		ro.observe(target)
		resizeObserverRef.current = ro

		return () => {
			ro.disconnect()
			resizeObserverRef.current = null
		}
	}, [scrollerRef.current, followIfOverflowing])

	// ==================== New turn pinning ====================

	useEffect(() => {
		const prevTurnCount = prevTurnCountRef.current
		const curTurnCount = turns.length
		const prevMsgLen = prevMessagesLengthRef.current
		const curMsgLen = messages.length

		prevTurnCountRef.current = curTurnCount
		prevMessagesLengthRef.current = curMsgLen

		// First render: chat is being (re)opened with pre-existing history.
		// Don't pin to the latest turn, just jump to the bottom so the user
		// lands in the live area.
		if (isFirstRenderRef.current) {
			isFirstRenderRef.current = false
			const scroller = scrollerRef.current
			if (scroller) {
				requestAnimationFrame(() => {
					const sc = scrollerRef.current
					if (!sc) return
					const maxScroll = getContentMaxScroll(sc)
					sc.scrollTop = maxScroll
				})
			}
			return
		}

		if (curMsgLen <= prevMsgLen) return

		if (curTurnCount > prevTurnCount) {
			// New turn = the user just sent a message. Pin its top to the
			// viewport top so the user always sees their own message there.
			const scroller = scrollerRef.current
			if (!scroller) return

			isPinningRef.current = true
			disableAutoScrollRef.current = false
			setIsAtBottom(false)
			setShowScrollToBottom(false)

			requestAnimationFrame(() => {
				const lastTurnEl = scroller.querySelector(
					`[data-turn-index="${curTurnCount - 1}"]`,
				) as HTMLElement | null

				if (lastTurnEl) {
					programmaticScrollUntilRef.current = Date.now() + 200
					const elTop = lastTurnEl.offsetTop - scroller.offsetTop
					scroller.scrollTo({ top: elTop, behavior: "auto" })
				}

				requestAnimationFrame(() => {
					isPinningRef.current = false
				})
			})
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages.length, turns.length])

	// ==================== Pending scroll-to-message ====================

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

	// ==================== Cleanup ====================

	useEffect(
		() => () => {
			if (wheelTimeoutRef.current != null) {
				clearTimeout(wheelTimeoutRef.current)
			}
		},
		[],
	)

	return {
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
		onScrollerRef,
	}
}
