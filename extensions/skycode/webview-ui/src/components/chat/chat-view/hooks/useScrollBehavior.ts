import { SkycodeMessage } from "@shared/ExtensionMessage"
import { useCallback, useEffect, useRef, useState } from "react"
import { RowExpansionOptions, ScrollBehavior } from "../types/chatTypes"
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
 *   4. The bottom footer-spacer (rendered in MessagesArea) is SIZED
 *      DYNAMICALLY here to `max(0, clientHeight - lastTurnHeight)`.
 *      Consequence: the natural max scrollTop equals `lastTurn.offsetTop`
 *      while the last turn fits the viewport, so the browser itself
 *      forbids scrolling past the pinned user message (no more "the last
 *      turn flew off the top into empty space"). When the last turn grows
 *      beyond the viewport, footer collapses to 0 and tail-following
 *      behaves as in any chat / terminal log.
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
	// The element is kept in state as well: effects that attach listeners must
	// re-run when the node is replaced, and a ref never triggers that.
	const [scrollerEl, setScrollerEl] = useState<HTMLElement | null>(null)
	const scrollerRef = useRef<HTMLElement | null>(null)
	const footerRef = useRef<HTMLElement | null>(null)
	const isPinningRef = useRef(false)
	const userInteractingRef = useRef(false)
	const turnsRef = useRef(turns)
	turnsRef.current = turns
	const prevTurnCountRef = useRef(turns.length)
	const prevMessagesLengthRef = useRef(messages.length)
	const isFirstRenderRef = useRef(true)
	const resizeObserverRef = useRef<ResizeObserver | null>(null)
	const footerObserverRef = useRef<ResizeObserver | null>(null)
	const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const keyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const settleTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

	// Our own scrollTo is recognised by where it lands, not by how long ago it
	// was issued: during streaming a time window would be re-armed on every
	// chunk and swallow every real scroll event for the whole answer.
	// `expected: null` means "anything within the window is ours" — used for
	// smooth scrolls, which pass through many intermediate positions.
	const programmaticScrollRef = useRef<{ expected: number | null; until: number }>({
		expected: null,
		until: 0,
	})

	const markProgrammaticScroll = useCallback((expected: number | null, durationMs: number) => {
		programmaticScrollRef.current = { expected, until: Date.now() + durationMs }
	}, [])

	const forgetProgrammaticScroll = useCallback(() => {
		programmaticScrollRef.current = { expected: null, until: 0 }
	}, [])

	const isProgrammaticScroll = useCallback((scrollTop: number) => {
		const { expected, until } = programmaticScrollRef.current
		if (Date.now() >= until) { return false }
		return expected === null || Math.abs(scrollTop - expected) <= 2
	}, [])

	// ---------- helpers ----------

	/** Find the last turn element inside the scroller. */
	const getLastTurnEl = useCallback((): HTMLElement | null => {
		const scroller = scrollerRef.current
		if (!scroller) { return null }
		const turnEls = scroller.querySelectorAll<HTMLElement>("[data-turn-index]")
		return turnEls.length ? turnEls[turnEls.length - 1] : null
	}, [])

	/** Resize the footer-spacer so that the natural max scrollTop equals
	 *  `lastTurn.offsetTop` while the last turn fits the viewport. When
	 *  the last turn overflows, footer collapses to 0 and the user can
	 *  scroll further down to follow the streaming tail. */
	const resizeFooter = useCallback(() => {
		const scroller = scrollerRef.current
		const footer = footerRef.current
		if (!scroller || !footer) { return }
		const lastTurnEl = getLastTurnEl()
		if (!lastTurnEl) {
			footer.style.minHeight = "0px"
			footer.style.height = "0px"
			return
		}
		const lastTurnHeight = lastTurnEl.getBoundingClientRect().height
		const desired = Math.max(0, scroller.clientHeight - lastTurnHeight)
		const desiredPx = `${desired}px`
		if (footer.style.minHeight !== desiredPx) {
			footer.style.minHeight = desiredPx
			footer.style.height = desiredPx
		}
	}, [getLastTurnEl])

	const getContentMaxScroll = useCallback((scroller: HTMLElement) => {
		// The footer is sized dynamically (see resizeFooter) so that the
		// natural max scrollTop is exactly where we want the user to be
		// allowed to scroll. No footer subtraction needed.
		return Math.max(0, scroller.scrollHeight - scroller.clientHeight)
	}, [])

	/** Tail-mode follow: if the answer has overflowed the viewport bottom
	 *  (scrollTop < maxScroll), clamp scrollTop to maxScroll so the new
	 *  content appears at the bottom edge. While the answer still fits
	 *  above (scrollTop >= maxScroll, which is the case right after pinning
	 *  the user message thanks to the footer-spacer), do NOTHING — keep
	 *  the user message pinned at the top. */
	const followIfOverflowing = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) { return }
		if (isPinningRef.current) { return }
		if (disableAutoScrollRef.current) { return }
		if (userInteractingRef.current) { return }

		const maxScroll = getContentMaxScroll(scroller)
		if (scroller.scrollTop < maxScroll) {
			markProgrammaticScroll(maxScroll, 250)
			scroller.scrollTop = maxScroll
		}
	}, [getContentMaxScroll, markProgrammaticScroll])

	// --- public API ---

	/** Used when the layout shrinks under a reader who is already at the bottom
	 *  (the input box growing, for one). Unlike a deliberate jump it neither
	 *  re-enables following nor hides the button — it only avoids the gap. */
	const keepAtBottom = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) { return }
		if (disableAutoScrollRef.current) { return }
		const maxScroll = getContentMaxScroll(scroller)
		if (scroller.scrollTop >= maxScroll) { return }
		markProgrammaticScroll(maxScroll, 250)
		scroller.scrollTop = maxScroll
	}, [getContentMaxScroll, markProgrammaticScroll])

	const scrollToBottomSmooth = useCallback(() => {
		const scroller = scrollerRef.current
		if (!scroller) { return }
		disableAutoScrollRef.current = false
		setShowScrollToBottom(false)
		const maxScroll = getContentMaxScroll(scroller)
		// A smooth scroll passes through many positions — match on time alone.
		markProgrammaticScroll(null, 700)
		scroller.scrollTo({ top: maxScroll, behavior: "smooth" })
	}, [getContentMaxScroll, markProgrammaticScroll])

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
				if (turnIndex !== -1) { break }
			}

			if (turnIndex !== -1) {
				setPendingScrollToMessage(null)
				disableAutoScrollRef.current = true
				setShowScrollToBottom(true)

				requestAnimationFrame(() => {
					const scroller = scrollerRef.current
					if (!scroller) { return }
					const turnEl = scroller.querySelector(`[data-turn-index="${turnIndex}"]`) as HTMLElement | null
					if (turnEl) {
						markProgrammaticScroll(null, 700)
						turnEl.scrollIntoView({ block: "start", behavior: "smooth" })
					}
				})
			} else {
				setPendingScrollToMessage(null)
			}
		},
		[messages, turns, markProgrammaticScroll],
	)

	// --- toggleRowExpansion ---

	const toggleRowExpansion = useCallback(
		(ts: number, options?: RowExpansionOptions) => {
			const isCollapsing = expandedRows[ts] ?? false
			const userInitiated = options?.userInitiated !== false
			setExpandedRows((prev) => ({ ...prev, [ts]: !prev[ts] }))

			if (!isCollapsing) {
				// Expanding by hand – the user is reading something specific,
				// don't auto-yank them down. An expansion the app decided on
				// (a long-running command) must not stop following.
				if (userInitiated) {
					disableAutoScrollRef.current = true
					setShowScrollToBottom(true)
				}
			} else {
				// Collapsing → clamp scrollTop so we don't end up below the
				// new (smaller) maxScroll.
				requestAnimationFrame(() => {
					requestAnimationFrame(() => {
						const scroller = scrollerRef.current
						if (!scroller) { return }
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

	// ==================== Scroller ref callback ====================

	const onScrollerRef = useCallback((ref: HTMLElement | null) => {
		scrollerRef.current = ref
		setScrollerEl(ref)
	}, [])

	const onFooterRef = useCallback(
		(ref: HTMLElement | null) => {
			footerRef.current = ref
			if (ref) {
				// Size immediately so first paint never shows the wrong
				// (huge) scrollable area.
				resizeFooter()
			}
		},
		[resizeFooter],
	)

	// ==================== User interaction detection ====================

	useEffect(() => {
		const scroller = scrollerEl
		if (!scroller) { return }

		const onWheel = (e: WheelEvent) => {
			userInteractingRef.current = true

			if (e.deltaY < 0) {
				// User scrolled up → disable follow until they return near
				// the bottom (handleScroll re-enables it).
				disableAutoScrollRef.current = true
				forgetProgrammaticScroll()
				setShowScrollToBottom(true)
			}

			if (wheelTimeoutRef.current) { clearTimeout(wheelTimeoutRef.current) }
			wheelTimeoutRef.current = setTimeout(() => {
				userInteractingRef.current = false
			}, 150)
		}

		// Keyboard scrolling counts as a gesture too. Without this, PageUp
		// inside the chat was followed by an immediate yank back down.
		const SCROLL_UP_KEYS = new Set(["PageUp", "ArrowUp", "Home"])
		const SCROLL_KEYS = new Set([...SCROLL_UP_KEYS, "PageDown", "ArrowDown", "End", " "])

		const onKeyDown = (e: KeyboardEvent) => {
			if (!SCROLL_KEYS.has(e.key)) { return }
			const target = e.target as HTMLElement | null
			if (target?.isContentEditable || (target && /^(input|textarea|select)$/i.test(target.tagName))) {
				return
			}
			if (!scroller.contains(document.activeElement) && document.activeElement !== document.body) {
				return
			}

			userInteractingRef.current = true
			if (SCROLL_UP_KEYS.has(e.key)) {
				disableAutoScrollRef.current = true
				forgetProgrammaticScroll()
				setShowScrollToBottom(true)
			}

			if (keyTimeoutRef.current) { clearTimeout(keyTimeoutRef.current) }
			keyTimeoutRef.current = setTimeout(() => {
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
		window.addEventListener("keydown", onKeyDown, { passive: true })
		scroller.addEventListener("touchstart", markUserInteraction, { passive: true })
		scroller.addEventListener("pointerdown", markUserInteraction, { passive: true })
		scroller.addEventListener("touchend", clearUserInteraction, { passive: true })
		scroller.addEventListener("pointerup", clearUserInteraction, { passive: true })

		return () => {
			scroller.removeEventListener("wheel", onWheel)
			window.removeEventListener("keydown", onKeyDown)
			scroller.removeEventListener("touchstart", markUserInteraction)
			scroller.removeEventListener("pointerdown", markUserInteraction)
			scroller.removeEventListener("touchend", clearUserInteraction)
			scroller.removeEventListener("pointerup", clearUserInteraction)
			if (wheelTimeoutRef.current) { clearTimeout(wheelTimeoutRef.current) }
			if (keyTimeoutRef.current) { clearTimeout(keyTimeoutRef.current) }
		}
	}, [scrollerEl, forgetProgrammaticScroll])

	// ==================== Scroll event — auto-scroll toggle / button ====================

	useEffect(() => {
		const scroller = scrollerEl
		if (!scroller) { return }

		const handleScroll = () => {
			if (isPinningRef.current) { return }

			// With the dynamic footer, max scrollTop already equals either
			// `lastTurn.offsetTop` (short answer) or end-of-last-turn (long
			// answer). So we can use the natural distance to content end.
			const distanceFromContent = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight

			// `isAtBottom` is consumed by InputSection; keep it fresh even for
			// our own scrolls, otherwise it goes stale for a whole answer.
			setIsAtBottom(distanceFromContent <= AT_BOTTOM_PX)

			// Our own scrollTo must not be mistaken for a gesture.
			if (isProgrammaticScroll(scroller.scrollTop) && !userInteractingRef.current) { return }

			const nearBottom = distanceFromContent <= NEAR_BOTTOM_PX

			if (nearBottom) {
				disableAutoScrollRef.current = false
				setShowScrollToBottom(false)
			} else if (userInteractingRef.current) {
				disableAutoScrollRef.current = true
				setShowScrollToBottom(true)
			}
		}

		scroller.addEventListener("scroll", handleScroll, { passive: true })
		return () => scroller.removeEventListener("scroll", handleScroll)
	}, [scrollerEl, isProgrammaticScroll])

	// ==================== ResizeObserver — follow content growth ====================

	useEffect(() => {
		const scroller = scrollerEl
		if (!scroller) { return }

		// Observe the turns box only (see MessagesArea): the footer spacer is
		// resized from inside this callback, and observing a node that contains
		// it would feed that resize straight back into the observer.
		const target =
			scroller.querySelector<HTMLElement>("[data-chat-turns]") ?? scroller.firstElementChild ?? scroller

		const ro = new ResizeObserver(() => {
			// Footer needs to be re-sized BEFORE we decide whether to tail.
			// Otherwise tail-follow would clamp to a wrong maxScroll for one
			// frame (visible "the answer jumps to the bottom for a tick").
			resizeFooter()
			followIfOverflowing()
		})

		ro.observe(target)
		resizeObserverRef.current = ro

		return () => {
			ro.disconnect()
			resizeObserverRef.current = null
		}
	}, [scrollerEl, followIfOverflowing, resizeFooter])

	// ==================== Dynamic footer sizing ====================
	//
	// Re-targets a dedicated ResizeObserver at the CURRENT last turn each
	// time the turn count changes. While the last turn streams new content
	// the observer fires for every height change → footer shrinks by the
	// same amount → scrollHeight is invariant → pinned scrollTop stays
	// glued to lastTurn.offsetTop without any explicit re-scroll.

	const lastTurnTs = turns.length ? turns[turns.length - 1].userMessage.ts : 0

	useEffect(() => {
		const scroller = scrollerEl
		if (!scroller) { return }
		const lastTurnEl = getLastTurnEl()
		if (!lastTurnEl) { return }

		resizeFooter()

		const ro = new ResizeObserver(() => {
			resizeFooter()
		})
		ro.observe(lastTurnEl)
		ro.observe(scroller)
		footerObserverRef.current = ro

		return () => {
			ro.disconnect()
			footerObserverRef.current = null
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [turns.length, lastTurnTs, scrollerEl])

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

			// Markdown, syntax highlighting and images land after the first
			// frame, so one jump is not enough: the view drifts off the latest
			// message and the first growth tick then yanks it back. Re-settle a
			// couple of times instead, and stop the moment the user takes over.
			const settle = () => {
				const sc = scrollerRef.current
				if (!sc) { return }
				if (userInteractingRef.current || disableAutoScrollRef.current) { return }
				resizeFooter()
				const maxScroll = getContentMaxScroll(sc)
				markProgrammaticScroll(maxScroll, 250)
				sc.scrollTop = maxScroll
			}

			requestAnimationFrame(settle)
			settleTimersRef.current.push(setTimeout(settle, 150), setTimeout(settle, 450))
			return
		}

		if (curMsgLen <= prevMsgLen) { return }

		if (curTurnCount > prevTurnCount) {
			// New turn = the user just sent a message. Pin its top to the
			// viewport top so the user always sees their own message there.
			const scroller = scrollerRef.current
			if (!scroller) { return }

			isPinningRef.current = true
			disableAutoScrollRef.current = false
			setIsAtBottom(false)
			setShowScrollToBottom(false)

			// Robust pin: compute the target offset via rects (independent
			// of offsetParent quirks), size the footer first so that the
			// browser clamps to the EXACT pinning position, then scroll.
			// Repeat in a second rAF to absorb any late layout shifts from
			// the freshly mounted turn (fonts loading, icons settling, …).
			const pinOnce = () => {
				const sc = scrollerRef.current
				if (!sc) { return }
				resizeFooter()
				const lastTurnEl = getLastTurnEl()
				if (!lastTurnEl) { return }
				const scrollerRect = sc.getBoundingClientRect()
				const turnRect = lastTurnEl.getBoundingClientRect()
				const elTop = turnRect.top - scrollerRect.top + sc.scrollTop
				markProgrammaticScroll(elTop, 400)
				sc.scrollTop = elTop
			}

			requestAnimationFrame(() => {
				pinOnce()
				requestAnimationFrame(() => {
					pinOnce()
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
			if (keyTimeoutRef.current != null) {
				clearTimeout(keyTimeoutRef.current)
			}
			for (const timer of settleTimersRef.current) {
				clearTimeout(timer)
			}
			settleTimersRef.current = []
		},
		[],
	)

	return {
		scrollContainerRef,
		disableAutoScrollRef,
		scrollToBottomSmooth,
		keepAtBottom,
		scrollToMessage,
		toggleRowExpansion,
		showScrollToBottom,
		setShowScrollToBottom,
		isAtBottom,
		setIsAtBottom,
		pendingScrollToMessage,
		setPendingScrollToMessage,
		onScrollerRef,
		onFooterRef,
	}
}
