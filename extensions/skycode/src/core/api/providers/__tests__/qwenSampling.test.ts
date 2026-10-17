import { afterEach, describe, it } from "mocha"
import "should"
import {
	isExtraSamplingRejection,
	isExtraSamplingUnsupported,
	markExtraSamplingUnsupported,
	QWEN_RECOMMENDED_TEMPERATURE,
	qwenSampling,
	resetExtraSamplingSupport,
} from "../qwenSampling"

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

	describe("extra sampling fallback", () => {
		afterEach(() => resetExtraSamplingSupport())

		it("recognises a 400 that complains about top_k or extra fields", () => {
			isExtraSamplingRejection({ status: 400, message: "Unrecognized request argument supplied: top_k" }).should.be.true()
			isExtraSamplingRejection({ status: 400, message: "extra fields not permitted" }).should.be.true()
			isExtraSamplingRejection({ status: 400, message: "context length exceeded" }).should.be.false()
			isExtraSamplingRejection({ status: 500, message: "top_k" }).should.be.false()
			isExtraSamplingRejection(undefined).should.be.false()
		})

		it("remembers unsupported gateways per base url", () => {
			isExtraSamplingUnsupported("http://gw/v1").should.be.false()
			markExtraSamplingUnsupported("http://GW/v1/")
			isExtraSamplingUnsupported("http://gw/v1").should.be.true()
			isExtraSamplingUnsupported("http://other/v1").should.be.false()
		})
	})
})
