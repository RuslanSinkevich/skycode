import { expect } from "chai"
import { estimateContextBreakdown, estimateTokens } from "../contextBreakdown"

const toMap = (items: { category: string; tokens: number }[]) => Object.fromEntries(items.map((i) => [i.category, i.tokens]))

describe("estimateContextBreakdown", () => {
	it("кириллица оценивается дороже латиницы", () => {
		expect(estimateTokens("абвгдеёжзи")).to.be.greaterThan(estimateTokens("abcdefghij"))
	})

	it("классифицирует XML-результаты инструментов по префиксу", () => {
		const items = estimateContextBreakdown({
			messages: [
				{ role: "user", content: [{ type: "text", text: "сделай задачу" }] },
				{ role: "assistant", content: "ок" },
				{
					role: "user",
					content: [
						{ type: "text", text: "[read_file for 'a.ts'] Result:\n" + "x".repeat(700) },
						{ type: "text", text: "[execute_command for 'ls'] Result:\n" + "y".repeat(350) },
						{ type: "text", text: "[replace_in_file for 'a.ts'] Result:\n<final_file_content>" + "z".repeat(350) },
						{ type: "text", text: "<environment_details>\n" + "e".repeat(175) + "\n</environment_details>" },
					],
				},
			],
		})
		const m = toMap(items)
		expect(m.files).to.be.greaterThan(m.commands)
		expect(m.commands).to.be.greaterThan(0)
		expect(m.edits).to.be.greaterThan(0)
		expect(m.environment).to.be.greaterThan(0)
		expect(m.conversation).to.be.greaterThan(0)
		expect(m.system).to.equal(undefined)
	})

	it("распознаёт нативные tool_result по имени tool_use и file_content упоминания", () => {
		const m = toMap(
			estimateContextBreakdown({
				messages: [
					{ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "execute_command", input: { command: "ls" } }] },
					{
						role: "user",
						content: [
							{ type: "tool_result", tool_use_id: "t1", content: "out".repeat(300) },
							{ type: "text", text: 'вот <file_content path="a">' + "q".repeat(350) + "</file_content>" },
						],
					},
				],
			}),
		)
		expect(m.commands).to.be.greaterThan(m.conversation)
		expect(m.files).to.be.greaterThan(0)
	})

	it("масштабирует сумму к реальному итогу и учитывает системный промпт", () => {
		const items = estimateContextBreakdown({
			messages: [{ role: "user", content: "hello world" }],
			systemPromptChars: 3500,
			toolsChars: 3500,
			realTotalTokens: 10_000,
		})
		const sum = items.reduce((s, i) => s + i.tokens, 0)
		expect(Math.abs(sum - 10_000)).to.be.at.most(items.length)
		expect(toMap(items).system).to.be.greaterThan(toMap(items).conversation)
	})
})
