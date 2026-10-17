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

	it("param tags and misspelled tool tags are not answers", () => {
		isTextOnlyAnswer("Сейчас запишу.\n<path>a.ts</path>").should.be.false()
		isTextOnlyAnswer("<content>\nfoo\n</content>").should.be.false()
		isTextOnlyAnswer("Run it:\n<command>npm test</command>").should.be.false()
		isTextOnlyAnswer("<read_files>\n<path>a.ts").should.be.false()
		isTextOnlyAnswer("<write_file>").should.be.false()
	})

	it("html-like words in prose stay answers", () => {
		isTextOnlyAnswer("Add an <input> and a <title> to the page, then <b>bold</b> it.").should.be.true()
	})

	it("broken tool calls are not answers", () => {
		isTextOnlyAnswer("Смотрю файл.\n<read_file>\n<path>a.ts").should.be.false()
		isTextOnlyAnswer("<search_files>\n<parameter=regex>x</parameter>").should.be.false()
		isTextOnlyAnswer("<function=read_file>").should.be.false()
	})
})
