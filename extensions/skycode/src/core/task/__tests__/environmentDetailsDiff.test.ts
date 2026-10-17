import { describe, it } from "mocha"
import "should"
import {
	capTerminalOutput,
	deletedRangeToKey,
	ENV_TIME_INTERVAL_MS,
	type EnvSectionInput,
	selectEnvSections,
} from "../environmentDetailsDiff"

const mk = (visible: string, time = "t"): EnvSectionInput[] => [
	{ key: "visible", body: visible },
	{ key: "time", body: time, minIntervalMs: ENV_TIME_INTERVAL_MS },
	{ key: "mode", body: "ACT", always: true },
]

describe("selectEnvSections", () => {
	it("sends everything on the first turn", () => {
		const { texts } = selectEnvSections(mk("a"), undefined, "", 0)
		;[...texts.keys()].should.eql(["visible", "time", "mode"])
	})

	it("skips unchanged sections but keeps always-sections", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const second = selectEnvSections(mk("a"), first.cache, "", 1000)
		;[...second.texts.keys()].should.eql(["mode"])
	})

	it("resends a changed section", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const second = selectEnvSections(mk("b"), first.cache, "", 1000)
		;[...second.texts.keys()].should.eql(["visible", "mode"])
	})

	it("resends time after the interval", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const second = selectEnvSections(mk("a", "t2"), first.cache, "", ENV_TIME_INTERVAL_MS)
		;[...second.texts.keys()].should.eql(["time", "mode"])
	})

	it("resends everything when the deleted range changed", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const second = selectEnvSections(mk("a"), first.cache, deletedRangeToKey([2, 5]), 1000)
		;[...second.texts.keys()].should.eql(["visible", "time", "mode"])
	})

	it("resends a section that disappeared and came back", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const gone = selectEnvSections(mk(""), first.cache, "", 1000)
		const back = selectEnvSections(mk("a"), gone.cache, "", 2000)
		back.texts.has("visible").should.be.true()
	})

	it("forceAll resends everything", () => {
		const first = selectEnvSections(mk("a"), undefined, "", 0)
		const second = selectEnvSections(mk("a"), first.cache, "", 1000, true)
		second.texts.size.should.equal(3)
	})
})

describe("capTerminalOutput", () => {
	it("returns short output unchanged", () => {
		capTerminalOutput("a\nb").should.equal("a\nb")
	})

	it("keeps the last lines and reports omitted ones", () => {
		const out = Array.from({ length: 100 }, (_, i) => `l${i}`).join("\n")
		const capped = capTerminalOutput(out)
		capped.split("\n")[0].should.equal("(… 60 earlier lines omitted)")
		capped.endsWith("l99").should.be.true()
		capped.split("\n").length.should.equal(41)
	})

	it("respects the char limit", () => {
		const out = Array.from({ length: 30 }, () => "x".repeat(300)).join("\n")
		capTerminalOutput(out).length.should.be.below(4100)
	})

	it("truncates one huge line", () => {
		const capped = capTerminalOutput("y".repeat(10000))
		capped.length.should.be.below(4100)
	})
})
