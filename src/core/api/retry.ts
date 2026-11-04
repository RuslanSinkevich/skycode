import { Logger } from "@/shared/services/Logger"

interface RetryOptions {
	maxRetries?: number
	baseDelay?: number
	maxDelay?: number
	retryAllErrors?: boolean
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
	maxRetries: 3,
	baseDelay: 1_000,
	maxDelay: 10_000,
	retryAllErrors: false,
}

export class RetriableError extends Error {
	status: number = 429
	retryAfter?: number

	constructor(message: string, retryAfter?: number, options?: ErrorOptions) {
		super(message, options)
		this.name = "RetriableError"

		this.retryAfter = retryAfter
	}
}

// [SKYCODE] Транспортные сбои, которые имеет смысл повторять: обрыв соединения, таймаут,
// DNS, 5xx на стороне шлюза. Раньше ретраился только 429, поэтому каждый «Connection error»
// на самостоятельно поднятом OpenAI-совместимом эндпоинте прилетал пользователю как отказ.
const TRANSIENT_ERROR_CODES = new Set([
	"ECONNABORTED",
	"ECONNREFUSED",
	"ECONNRESET",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"ENOTFOUND",
	"EAI_AGAIN",
	"EPIPE",
	"ETIMEDOUT",
	"UND_ERR_CONNECT_TIMEOUT",
	"UND_ERR_HEADERS_TIMEOUT",
	"UND_ERR_SOCKET",
])

const TRANSIENT_MESSAGE_RE = /connection error|request timed out|socket hang up|network error|fetch failed|terminated/i

function isAbortError(error: any): boolean {
	const name = error?.name
	return name === "AbortError" || name === "APIUserAbortError" || /request was aborted/i.test(error?.message ?? "")
}

function isTransientError(error: any): boolean {
	if (typeof error?.status === "number" && error.status >= 500) {
		return true
	}
	for (const code of [error?.code, error?.errno, error?.cause?.code, error?.cause?.errno]) {
		if (typeof code === "string" && TRANSIENT_ERROR_CODES.has(code)) {
			return true
		}
	}
	return TRANSIENT_MESSAGE_RE.test(error?.message ?? "")
}

export function withRetry(options: RetryOptions = {}) {
	const { maxRetries, baseDelay, maxDelay, retryAllErrors } = { ...DEFAULT_OPTIONS, ...options }

	return (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value

		descriptor.value = async function* (...args: any[]) {
			for (let attempt = 0; attempt < maxRetries; attempt++) {
				// [SKYCODE] Ретрай перезапускает генератор с нуля, а чанки, которые потребитель уже
				// получил, никуда не денутся — повтор склеил бы ответ сам с собой. Поэтому повторяем
				// только сбой, случившийся до первого чанка.
				let yieldedChunk = false
				try {
					for await (const chunk of originalMethod.apply(this, args)) {
						yieldedChunk = true
						yield chunk
					}
					return
				} catch (error: any) {
					const isRateLimit = error?.status === 429 || error instanceof RetriableError
					const isLastAttempt = attempt === maxRetries - 1
					const isRetriable = isRateLimit || isTransientError(error) || retryAllErrors

					if (!isRetriable || isLastAttempt || isAbortError(error) || yieldedChunk) {
						throw error
					}

					// Get retry delay from header or calculate exponential backoff
					// Check various rate limit headers
					const retryAfter =
						error.headers?.["retry-after"] ||
						error.headers?.["x-ratelimit-reset"] ||
						error.headers?.["ratelimit-reset"] ||
						error.retryAfter

					let delay: number
					if (retryAfter) {
						// Handle both delta-seconds and Unix timestamp formats
						const retryValue = parseInt(retryAfter, 10)
						if (retryValue > Date.now() / 1000) {
							// Unix timestamp
							delay = retryValue * 1000 - Date.now()
						} else {
							// Delta seconds
							delay = retryValue * 1000
						}
					} else {
						// Use exponential backoff if no header
						delay = Math.min(maxDelay, baseDelay * 2 ** attempt)
					}

					const handlerInstance = this as any
					if (handlerInstance.options?.onRetryAttempt) {
						try {
							await handlerInstance.options.onRetryAttempt(attempt + 1, maxRetries, delay, error)
						} catch (e) {
							Logger.error("Error in onRetryAttempt callback:", e)
						}
					}

					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		return descriptor
	}
}
