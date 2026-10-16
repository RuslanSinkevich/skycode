import { describe, it } from "mocha"
import "should"
import { isTextOnlyAnswer } from "../textOnlyReply"

describe("isTextOnlyAnswer", () => {
	it("plain answer or question to the user", () => {
		isTextOnlyAnswer("Готово. Какой вариант берём?").should.be.true()
		isTextOnlyAnswer("Use `<div>` here, not <span>.").should.be.true()
	})

	it("empty or only service blocks is not an answer", () => {
		isTextOnlyAnswer("  \n ").should.be.false()
		isTextOnlyAnswer("<task_progress>\n- [x] a\n</task_progress>").should.be.false()
		isTextOnlyAnswer("<thinking>hmm</thinking>").should.be.false()
	})

	it("broken tool calls are not answers", () => {
		isTextOnlyAnswer("Смотрю файл.\n<read_file>\n<path>a.ts").should.be.false()
		isTextOnlyAnswer("<search_files>\n<parameter=regex>x</parameter>").should.be.false()
		isTextOnlyAnswer("<function=read_file>").should.be.false()
	})
})
