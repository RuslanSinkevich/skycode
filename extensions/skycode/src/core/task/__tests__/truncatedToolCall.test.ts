import { describe, it } from "mocha"
import "should"
import { isTruncatedToolCall, TRUNCATED_TOOL_NOTE_PREFIX, truncatedToolNote } from "../truncatedToolCall"

describe("isTruncatedToolCall", () => {
	it("content cut off before </content> is truncated", () => {
		const text = "Пишу файл.\n<write_to_file>\n<path>a.ts</path>\n<content>\nexport const a = 1\nexport const b"
		isTruncatedToolCall(
			"write_to_file",
			{ path: "a.ts", content: "export const a = 1\nexport const b" },
			text,
		).should.be.true()
	})

	it("all params closed but no closing tool tag is not truncated", () => {
		const text = "<write_to_file>\n<path>a.ts</path>\n<content>\nconst a = 1\n</content>\n"
		isTruncatedToolCall("write_to_file", { path: "a.ts", content: "const a = 1" }, text).should.be.false()
	})

	it("closed html-like tags inside content do not hide the cut", () => {
		const text = "<write_to_file>\n<path>i.html</path>\n<content>\n<title>x</title>\n<p>half"
		isTruncatedToolCall("write_to_file", { path: "i.html", content: "<title>x</title>\n<p>half" }, text).should.be.true()
	})

	it("cut replace_in_file diff and execute_command are truncated", () => {
		isTruncatedToolCall(
			"replace_in_file",
			{ path: "a.ts", diff: "------- SEARCH\nfoo" },
			"<replace_in_file>\n<path>a.ts</path>\n<diff>\n------- SEARCH\nfoo",
		).should.be.true()
		isTruncatedToolCall(
			"execute_command",
			{ command: "rm -rf dis" },
			"<execute_command>\n<command>rm -rf dis",
		).should.be.true()
	})

	it("read-only tools are never treated as truncated", () => {
		isTruncatedToolCall("read_file", { path: "src/a" }, "<read_file>\n<path>src/a").should.be.false()
	})

	it("note names the tools and has the prefix", () => {
		const note = truncatedToolNote(["write_to_file"])
		note.startsWith(TRUNCATED_TOOL_NOTE_PREFIX).should.be.true()
		note.should.containEql("write_to_file")
	})
})
