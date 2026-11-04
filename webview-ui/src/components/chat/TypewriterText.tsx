import { memo, useEffect, useRef, useState } from "react"

// TypewriterText with shimmer effect after typing completes.
// [SKYCODE-PERF] Use a ref for the latest text + a single long-lived interval,
// instead of recreating the interval on every text change. With a streaming
// string this used to thrash setInterval/clearInterval per token.
export const TypewriterText = memo(({ text, speed = 30 }: { text: string; speed?: number }) => {
	const [displayedLength, setDisplayedLength] = useState(0)
	const [isComplete, setIsComplete] = useState(false)
	const textRef = useRef(text)
	textRef.current = text

	useEffect(() => {
		// New text → restart typing animation.
		setDisplayedLength(0)
		setIsComplete(false)
		const interval = setInterval(() => {
			setDisplayedLength((prev) => {
				const target = textRef.current.length
				if (prev >= target) {
					return prev
				}
				const next = prev + 1
				if (next >= target) {
					setIsComplete(true)
				}
				return next
			})
		}, speed)
		return () => clearInterval(interval)
		// Only re-run when speed changes or when the previous animation actually finished
		// — for streaming text we just bump textRef.current and let the interval catch up.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [speed])

	// If the source text grows past what we've shown, mark "not complete" so the
	// interval keeps animating; if it shrinks (rare), clamp.
	useEffect(() => {
		if (displayedLength > text.length) {
			setDisplayedLength(text.length)
			setIsComplete(true)
		} else if (isComplete && displayedLength < text.length) {
			setIsComplete(false)
		}
	}, [text, displayedLength, isComplete])

	if (isComplete && displayedLength >= text.length) {
		return (
			<span className="animate-shimmer bg-linear-90 from-foreground to-description bg-[length:200%_100%] bg-clip-text text-transparent truncate">
				{text}
			</span>
		)
	}

	return <span className="truncate">{text.slice(0, displayedLength)}</span>
})

TypewriterText.displayName = "TypewriterText"
