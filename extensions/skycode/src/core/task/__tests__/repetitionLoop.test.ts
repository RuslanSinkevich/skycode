import { describe, it } from "mocha"
import "should"
import { hasRepetitionLoop, RepetitionLoopDetector } from "../repetitionLoop"

const paragraph =
	'Hmm, but wait. Let me reconsider. The screenshot shows a "Быстрые фильтры" popover with a "Показывать" select. The user\'s original request was "make it wider so the entire city list fits without ellipsis."\n\n'

describe("repetition loop", () => {
	it("detects a paragraph repeated many times", () => {
		hasRepetitionLoop("Intro text. ".repeat(20) + paragraph.repeat(10)).should.be.true()
	})

	it("ignores normal varied text and a few repeats", () => {
		const varied = Array.from({ length: 200 }, (_, i) => `Line ${i}: value ${i * 7}`).join("\n")
		hasRepetitionLoop(varied).should.be.false()
		hasRepetitionLoop(varied + paragraph.repeat(3)).should.be.false()
	})

	it("does not fire on repetitive code, tables and data", () => {
		hasRepetitionLoop("const a = 1\n".repeat(60)).should.be.false()
		hasRepetitionLoop("0, ".repeat(400)).should.be.false()
		hasRepetitionLoop("| --- | --- | --- |\n".repeat(60)).should.be.false()
		hasRepetitionLoop("*-*-*-*-".repeat(100)).should.be.false()
		hasRepetitionLoop("A".repeat(3000)).should.be.false()
		hasRepetitionLoop("The quick brown fox jumps. ".repeat(80)).should.be.false()
	})

	it("detector fires while streaming a loop", () => {
		const detector = new RepetitionLoopDetector()
		let fired = false
		for (let i = 0; i < 40 && !fired; i++) {
			fired = detector.push(paragraph)
		}
		fired.should.be.true()
	})
})
