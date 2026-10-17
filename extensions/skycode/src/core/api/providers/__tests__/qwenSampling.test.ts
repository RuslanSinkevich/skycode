import { describe, it } from "mocha"
import "should"
import { QWEN_RECOMMENDED_TEMPERATURE, qwenSampling } from "../qwenSampling"

describe("qwenSampling", () => {
	it("replaces greedy or missing temperature for Qwen", () => {
		qwenSampling("Qwen/Qwen3.8-27B-FP8", 0)!.should.deepEqual({ temperature: QWEN_RECOMMENDED_TEMPERATURE, top_p: 0.95, top_k: 20 })
		qwenSampling("qwen3-coder-plus", undefined)!.temperature.should.equal(QWEN_RECOMMENDED_TEMPERATURE)
	})

	it("keeps an explicit non-zero temperature", () => {
		qwenSampling("Qwen/Qwen3.8-27B-FP8", 0.3)!.temperature.should.equal(0.3)
	})

	it("leaves other models alone", () => {
		;(qwenSampling("gpt-4o", 0) === undefined).should.be.true()
	})
})
