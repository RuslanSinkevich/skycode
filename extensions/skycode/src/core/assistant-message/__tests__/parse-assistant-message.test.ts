import { expect } from "chai"
import type { ToolUse } from ".."
import { parseAssistantMessageV2 } from "../parse-assistant-message"

const toolUses = (message: string): ToolUse[] =>
	parseAssistantMessageV2(message).filter((block): block is ToolUse => block.type === "tool_use")

describe("parseAssistantMessageV2", () => {
	it("parses a well-formed tool call", () => {
		const [tool] = toolUses(`<execute_command>
<command>npm test</command>
<timeout>300</timeout>
</execute_command>`)

		expect(tool.name).to.equal("execute_command")
		expect(tool.params).to.deep.equal({ command: "npm test", timeout: "300" })
		expect(tool.partial).to.equal(false)
	})

	describe("generic <parameter…> wrappers", () => {
		it("reads alternating name/value tags", () => {
			const [tool] = toolUses(`<search_files>
<parameter1_name>path</parameter1_name>
<parameter1_name>client-new/src</parameter1_name>
<parameter1_name>regex</parameter1_name>
<parameter1_name>noteTypeIds</parameter1_name>
<parameter1_name>file_pattern</parameter1_name>
<parameter1_name>*.tsx</parameter1_name>
</search_files>`)

			expect(tool.params).to.deep.equal({
				path: "client-new/src",
				regex: "noteTypeIds",
				file_pattern: "*.tsx",
			})
		})

		it("reads a value left unwrapped after a name-only tag", () => {
			const [tool] = toolUses(`<execute_command>
<command>dir /s /b</command>
<parameter_name>timeout</parameter_name>
<parameter_name>task_progress</parameter_name>
- [x] Step one
- [ ] Step two
</parameter_name>
</execute_command>`)

			expect(tool.params.command).to.equal("dir /s /b")
			expect(tool.params.task_progress).to.equal("- [x] Step one\n- [ ] Step two")
		})

		it("reads <parameter_name>/<parameter_value> pairs", () => {
			const [tool] = toolUses(`<read_file>
<parameter_name>path</parameter_name>
<parameter_value>src/main.js</parameter_value>
</read_file>`)

			expect(tool.params).to.deep.equal({ path: "src/main.js" })
		})

		it("never overrides a normally parsed parameter", () => {
			const [tool] = toolUses(`<read_file>
<path>real/path.ts</path>
<parameter_name>path</parameter_name>
<parameter_value>wrapper/path.ts</parameter_value>
</read_file>`)

			expect(tool.params.path).to.equal("real/path.ts")
		})

		it("recovers params when the tool tag was never closed", () => {
			const [tool] = toolUses(`<search_files>
<parameter1_name>path</parameter1_name>
<parameter1_name>src</parameter1_name>
<parameter1_name>regex</parameter1_name>
<parameter1_name>TODO</parameter1_name>`)

			expect(tool.partial).to.equal(true)
			expect(tool.params).to.deep.equal({ path: "src", regex: "TODO" })
		})

		it("ignores repeated junk wrappers that carry no parameter name", () => {
			const [tool] = toolUses(`<search_files>
<parameter=path>client-new/src</parameter>
<parameter2>client-new/src</parameter2>
<parameter2>client-new/src</parameter2>
</search_files>`)

			expect(tool.params).to.deep.equal({ path: "client-new/src" })
		})
	})
})
