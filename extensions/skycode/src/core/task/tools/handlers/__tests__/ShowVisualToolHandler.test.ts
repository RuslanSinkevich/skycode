import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { buildVisualPayload, ShowVisualToolHandler } from "../ShowVisualToolHandler"

// [SKYCODE] Минимальный фейк TaskConfig: handler использует только taskState и callbacks
function makeConfig() {
	const said: Array<{ type: string; text?: string }> = []
	const errors: string[] = []
	const config: any = {
		taskState: { consecutiveMistakeCount: 0 },
		callbacks: {
			say: async (type: string, text?: string) => {
				said.push({ type, text })
				return 1
			},
			sayAndCreateMissingParamError: async (_tool: string, param: string) => {
				errors.push(param)
				return `missing ${param}`
			},
		},
	}
	return { config, said, errors }
}

const block = (params: Record<string, string>): any => ({ type: "tool_use", name: "show_visual", params, partial: false })

describe("ShowVisualToolHandler", () => {
	it("shows the visual and returns a short result", async () => {
		const { config, said } = makeConfig()
		const result = await new ShowVisualToolHandler().execute(config, block({ title: "Table", content: "<table></table>" }))
		assert.equal(said.length, 1)
		assert.equal(said[0].type, "visual")
		assert.deepEqual(JSON.parse(said[0].text!), { title: "Table", content: "<table></table>" })
		assert.ok(JSON.stringify(result).includes('Visual \\"Table\\" shown to the user.'))
	})

	it("errors on missing title", async () => {
		const { config, said, errors } = makeConfig()
		await new ShowVisualToolHandler().execute(config, block({ content: "<svg/>" }))
		assert.deepEqual(errors, ["title"])
		assert.equal(said.length, 0)
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
	})

	it("errors on missing content", async () => {
		const { config, errors } = makeConfig()
		await new ShowVisualToolHandler().execute(config, block({ title: "T" }))
		assert.deepEqual(errors, ["content"])
	})

	it("buildVisualPayload trims the title", () => {
		assert.deepEqual(JSON.parse(buildVisualPayload("  A ", "x")), { title: "A", content: "x" })
	})
})
