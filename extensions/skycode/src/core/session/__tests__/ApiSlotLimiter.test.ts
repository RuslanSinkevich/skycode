import { describe, it } from "mocha"
import "should"
import { ApiSlotLimiter, MAX_CONCURRENT_API_REQUESTS } from "../ApiSlotLimiter"

const tick = () => new Promise<void>((r) => setImmediate(r))

describe("ApiSlotLimiter", () => {
	it("has a default limit of 3", () => {
		MAX_CONCURRENT_API_REQUESTS.should.equal(3)
	})

	it("grants up to the limit immediately and queues the rest", async () => {
		const l = new ApiSlotLimiter(2)
		await l.acquire("a")
		await l.acquire("b")
		let granted = false
		const p = l.acquire("c").then((r) => {
			granted = true
			return r
		})
		await tick()
		granted.should.equal(false)
		l.isQueued("c").should.equal(true)
		l.activeCount.should.equal(2)
		void p
	})

	it("release hands the slot to waiters in FIFO order", async () => {
		const l = new ApiSlotLimiter(1)
		const order: string[] = []
		const r1 = await l.acquire("a")
		const pb = l.acquire("b").then((r) => {
			order.push("b")
			return r
		})
		const pc = l.acquire("c").then((r) => {
			order.push("c")
			return r
		})
		await tick()
		order.should.eql([])
		r1()
		const rb = await pb
		await tick()
		order.should.eql(["b"])
		l.activeCount.should.equal(1)
		rb()
		await pc
		order.should.eql(["b", "c"])
		l.isQueued("c").should.equal(false)
	})

	it("double release does not free an extra slot", async () => {
		const l = new ApiSlotLimiter(1)
		const r1 = await l.acquire("a")
		const pb = l.acquire("b")
		const pc = l.acquire("c")
		r1()
		r1()
		const rb = await pb
		await tick()
		l.isQueued("c").should.equal(true)
		l.activeCount.should.equal(1)
		rb()
		await pc
		l.activeCount.should.equal(1)
	})

	it("abort while queued removes the waiter and rejects", async () => {
		const l = new ApiSlotLimiter(1)
		const r1 = await l.acquire("a")
		const ac = new AbortController()
		const pb = l.acquire("b", ac.signal)
		const pc = l.acquire("c")
		l.isQueued("b").should.equal(true)
		ac.abort()
		let rejected = false
		await pb.catch(() => {
			rejected = true
		})
		rejected.should.equal(true)
		l.isQueued("b").should.equal(false)
		l.queuedCount.should.equal(1)
		r1()
		await pc
		l.activeCount.should.equal(1)
	})

	it("rejects immediately if the signal is already aborted", async () => {
		const l = new ApiSlotLimiter(1)
		const ac = new AbortController()
		ac.abort()
		let rejected = false
		await l.acquire("a", ac.signal).catch(() => {
			rejected = true
		})
		rejected.should.equal(true)
		l.activeCount.should.equal(0)
	})
})
