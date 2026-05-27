/**
 * Helper for ApiHandler implementations that need to support cancellation.
 *
 * Two abort surfaces are unified:
 *   1. SDK streams that expose `.controller.abort()` (OpenAI / Anthropic SDKs).
 *   2. Native fetch-based providers — they should call `getAbortSignal()` and
 *      pass it into `fetch(..., { signal })`.
 *
 * Usage:
 *   private aborter = new StreamAborter()
 *
 *   abort(): void { this.aborter.abort() }
 *
 *   async *createMessage(...) {
 *     const signal = this.aborter.reset()
 *     const stream = await client.chat.completions.create({...}, { signal })
 *     this.aborter.track(stream)   // for SDK streams with .controller
 *     try {
 *       for await (...) { ... }
 *     } finally {
 *       this.aborter.clear()
 *     }
 *   }
 */
export class StreamAborter {
	private controller: AbortController | null = null
	private currentStream: { controller?: { abort?: () => void } } | null = null

	/**
	 * Start a new request. Returns a fresh AbortSignal to pass into fetch/SDK options.
	 * Any previous controller is discarded (not aborted — caller decides).
	 */
	reset(): AbortSignal {
		this.controller = new AbortController()
		this.currentStream = null
		return this.controller.signal
	}

	/**
	 * Track an SDK stream object that exposes `.controller.abort()`.
	 * Some SDKs (OpenAI, Anthropic) need this in addition to (or instead of) the
	 * AbortSignal passed at request time.
	 */
	track(stream: unknown): void {
		this.currentStream = stream as { controller?: { abort?: () => void } }
	}

	/**
	 * Trigger cancellation of the in-flight request, if any.
	 * Safe to call multiple times and when nothing is in flight.
	 */
	abort(): void {
		try {
			this.controller?.abort()
		} catch {
			// ignore
		}
		try {
			this.currentStream?.controller?.abort?.()
		} catch {
			// ignore
		}
		this.currentStream = null
	}

	/**
	 * Clear references after the stream finishes normally. Does NOT call abort().
	 */
	clear(): void {
		this.currentStream = null
	}

	/**
	 * Read-only view of the current signal, for nested awaits inside createMessage.
	 * Returns undefined if no request is in flight.
	 */
	get signal(): AbortSignal | undefined {
		return this.controller?.signal
	}
}

/**
 * Wrap an async iterable so it throws "Aborted by user" as soon as `signal.aborted`
 * becomes true between chunks. Use for SDKs that don't accept an AbortSignal
 * natively (e.g. Google GenAI). Caller is still responsible for `aborter.clear()`.
 */
export async function* abortableIterator<T>(iter: AsyncIterable<T>, signal: AbortSignal): AsyncIterable<T> {
	for await (const item of iter) {
		if (signal.aborted) {
			throw new Error("Aborted by user")
		}
		yield item
	}
}

