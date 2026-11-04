/**
 * ApiSlotLimiter — [SKYCODE] FIFO-семафор на одновременные запросы к модели.
 *
 * Не больше MAX_CONCURRENT_API_REQUESTS задач стримят ответ одновременно, остальные
 * встают в очередь (статус «в очереди» во вкладке). Один экземпляр на Controller.
 */

/** Максимум одновременных запросов к модели от всех вкладок. */
export const MAX_CONCURRENT_API_REQUESTS = 3

interface Waiter {
	ownerId: string
	grant: () => void
}

export class ApiSlotLimiter {
	private active = 0
	private readonly queue: Waiter[] = []

	constructor(private readonly limit: number = MAX_CONCURRENT_API_REQUESTS) {}

	/**
	 * Занять слот. Возвращает функцию освобождения (идемпотентную).
	 * Если signal сработал, пока ждали в очереди, — выходим из очереди и отклоняем промис.
	 */
	acquire(ownerId: string, signal?: AbortSignal): Promise<() => void> {
		if (signal?.aborted) {
			return Promise.reject(new Error("ApiSlotLimiter: aborted"))
		}
		if (this.active < this.limit) {
			this.active++
			return Promise.resolve(this.makeRelease())
		}
		return new Promise<() => void>((resolve, reject) => {
			const onAbort = () => {
				const idx = this.queue.indexOf(waiter)
				if (idx !== -1) {
					this.queue.splice(idx, 1)
				}
				reject(new Error("ApiSlotLimiter: aborted"))
			}
			const waiter: Waiter = {
				ownerId,
				grant: () => {
					signal?.removeEventListener("abort", onAbort)
					// Слот уже передан этому ожидающему (active не менялся).
					resolve(this.makeRelease())
				},
			}
			signal?.addEventListener("abort", onAbort, { once: true })
			this.queue.push(waiter)
		})
	}

	/** Ждёт ли владелец в очереди. */
	isQueued(ownerId: string): boolean {
		return this.queue.some((w) => w.ownerId === ownerId)
	}

	get activeCount(): number {
		return this.active
	}

	get queuedCount(): number {
		return this.queue.length
	}

	private makeRelease(): () => void {
		let released = false
		return () => {
			if (released) {
				return
			}
			released = true
			const next = this.queue.shift()
			if (next) {
				// Слот переходит следующему по очереди без изменения active.
				next.grant()
			} else {
				this.active--
			}
		}
	}
}
