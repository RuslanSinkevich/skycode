// [SKYCODE] Этот набор раньше не запускался: он лежал вне `src/**/__tests__/` (мимо спеки mocha),
// импортировал describe/it из пакета "mocha" и использовал синтаксис `@withRetry()`, на котором
// нативное срезание типов в Node спотыкается. Декоратор теперь навешивается вызовом — поведение
// то же самое, но файл грузится.
import "should"
import sinon from "sinon"
import { withRetry } from "../retry"

type RetryOptions = Parameters<typeof withRetry>[0]

/** Навешивает withRetry на метод прототипа так же, как это делает синтаксис `@withRetry()`. */
function applyRetry(proto: object, key: string, options?: RetryOptions): void {
	const descriptor = Object.getOwnPropertyDescriptor(proto, key)
	if (!descriptor) {
		throw new Error(`No method '${key}' to decorate`)
	}
	withRetry(options)(proto, key, descriptor)
	Object.defineProperty(proto, key, descriptor)
}

/** Собирает объект с одним async-генератором, обёрнутым в withRetry. */
function makeRetrying(method: (...args: any[]) => AsyncGenerator<any>, options?: RetryOptions) {
	const target = { run: method }
	applyRetry(target, "run", options)
	return target
}

async function collect(stream: AsyncGenerator<any>): Promise<any[]> {
	const chunks: any[] = []
	for await (const chunk of stream) {
		chunks.push(chunk)
	}
	return chunks
}

function rateLimitError(headers?: Record<string, string>): any {
	const error: any = new Error("Rate limit exceeded")
	error.status = 429
	if (headers) {
		error.headers = headers
	}
	return error
}

describe("Retry Decorator", () => {
	// [SKYCODE] Своя песочница: глобальный sinon.restore() вычищает фейки из общей песочницы,
	// а соседние наборы (например litellm) держат там модульные стабы и полагаются на sinon.reset().
	const sandbox = sinon.createSandbox()

	afterEach(() => {
		sandbox.restore()
	})

	describe("withRetry", () => {
		it("should not retry on success", async () => {
			let callCount = 0
			const target = makeRetrying(async function* () {
				callCount++
				yield "success"
			})

			const result = await collect(target.run())

			callCount.should.equal(1)
			result.should.deepEqual(["success"])
		})

		it("should retry on rate limit (429) error", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						throw rateLimitError()
					}
					yield "success after retry"
				},
				{ maxRetries: 2, baseDelay: 10, maxDelay: 100 },
			)

			const result = await collect(target.run())

			callCount.should.equal(2)
			result.should.deepEqual(["success after retry"])
		})

		it("should not retry on non-rate-limit errors", async () => {
			let callCount = 0
			const target = makeRetrying(async function* () {
				callCount++
				throw new Error("Regular error")
			})

			try {
				await collect(target.run())
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Regular error")
				callCount.should.equal(1)
			}
		})

		it("should respect retry-after header with delta seconds", async () => {
			let callCount = 0
			const setTimeoutSpy = sandbox.spy(global, "setTimeout")
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						throw rateLimitError({ "retry-after": "0.01" }) // 10ms delay
					}
					yield "success after retry"
				},
				{ maxRetries: 2, baseDelay: 1000 }, // Large baseDelay to ensure the header takes precedence
			)

			const result = await collect(target.run())

			callCount.should.equal(2)
			setTimeoutSpy.calledOnce.should.be.true
			const [, delay] = setTimeoutSpy.getCall(0).args
			delay?.should.equal(0)
			result.should.deepEqual(["success after retry"])
		})

		it("should respect retry-after header with Unix timestamp", async () => {
			const setTimeoutSpy = sandbox.spy(global, "setTimeout")
			let callCount = 0
			const fixedDate = new Date("2010-01-01T00:00:00.000Z")
			const retryTimestamp = Math.floor(fixedDate.getTime() / 1000) + 0.01 // 10ms in the future
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						throw rateLimitError({ "retry-after": retryTimestamp.toString() })
					}
					yield "success after retry"
				},
				{ maxRetries: 2, baseDelay: 1000 },
			)

			const result = await collect(target.run())

			callCount.should.equal(2)
			setTimeoutSpy.calledOnce.should.be.true
			const [, delay] = setTimeoutSpy.getCall(0).args
			delay?.should.equal(fixedDate.getTime())
			result.should.deepEqual(["success after retry"])
		})

		it("should use exponential backoff when no retry-after header", async () => {
			const setTimeoutSpy = sandbox.spy(global, "setTimeout")
			let callCount = 0
			const baseDelay = 10
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						throw rateLimitError()
					}
					yield "success after retry"
				},
				{ maxRetries: 2, baseDelay, maxDelay: 100 },
			)

			const result = await collect(target.run())

			callCount.should.equal(2)
			setTimeoutSpy.calledOnce.should.be.true
			const [, delay] = setTimeoutSpy.getCall(0).args
			delay?.should.equal(baseDelay)
			result.should.deepEqual(["success after retry"])
		})

		it("should respect maxDelay", async () => {
			const setTimeoutSpy = sandbox.spy(global, "setTimeout")
			let callCount = 0
			const maxDelay = 10
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount < 3) {
						throw rateLimitError()
					}
					yield "success after retries"
				},
				{ maxRetries: 3, baseDelay: 50, maxDelay },
			)

			const result = await collect(target.run())

			callCount.should.equal(3)
			setTimeoutSpy.calledOnce.should.be.true
			const [, delay] = setTimeoutSpy.getCall(0).args
			delay?.should.equal(maxDelay)
			result.should.deepEqual(["success after retries"])
		})

		it("should throw after maxRetries attempts", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					throw rateLimitError()
				},
				{ maxRetries: 2, baseDelay: 10 },
			)

			try {
				await collect(target.run())
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Rate limit exceeded")
				callCount.should.equal(2) // Initial attempt + 1 retry
			}
		})
	})

	// [SKYCODE] Транспортные сбои на своём эндпоинте раньше прилетали пользователю сразу.
	describe("transient failures", () => {
		it("should retry a dropped connection", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Connection error.")
						error.code = "ECONNRESET"
						throw error
					}
					yield "recovered"
				},
				{ maxRetries: 3, baseDelay: 10, maxDelay: 20 },
			)

			const result = await collect(target.run())

			callCount.should.equal(2)
			result.should.deepEqual(["recovered"])
		})

		it("should retry a gateway 5xx", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					if (callCount === 1) {
						const error: any = new Error("Bad gateway")
						error.status = 502
						throw error
					}
					yield "recovered"
				},
				{ maxRetries: 3, baseDelay: 10, maxDelay: 20 },
			)

			await collect(target.run())

			callCount.should.equal(2)
		})

		it("should not retry a 4xx", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					const error: any = new Error("Bad request")
					error.status = 400
					throw error
				},
				{ maxRetries: 3, baseDelay: 10 },
			)

			try {
				await collect(target.run())
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Bad request")
				callCount.should.equal(1)
			}
		})

		it("should not retry an aborted request", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					const error: any = new Error("Request was aborted.")
					error.name = "APIUserAbortError"
					throw error
				},
				{ maxRetries: 3, baseDelay: 10, retryAllErrors: true },
			)

			try {
				await collect(target.run())
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.name.should.equal("APIUserAbortError")
				callCount.should.equal(1)
			}
		})

		it("should not replay a stream that already produced chunks", async () => {
			let callCount = 0
			const target = makeRetrying(
				async function* () {
					callCount++
					yield "first half"
					const error: any = new Error("Connection error.")
					error.code = "ECONNRESET"
					throw error
				},
				{ maxRetries: 3, baseDelay: 10 },
			)

			const received: any[] = []
			try {
				for await (const chunk of target.run()) {
					received.push(chunk)
				}
				throw new Error("Should have thrown")
			} catch (error: any) {
				error.message.should.equal("Connection error.")
				// Повторный проход выдал бы "first half" второй раз и склеил ответ сам с собой
				callCount.should.equal(1)
				received.should.deepEqual(["first half"])
			}
		})
	})
})
