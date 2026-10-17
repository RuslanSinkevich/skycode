import { strict as assert } from "node:assert"
import { describe, it } from "mocha"
import { ShowChartToolHandler, validateChartData } from "../ShowChartToolHandler"

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

const block = (params: Record<string, string>): any => ({ type: "tool_use", name: "show_chart", params, partial: false })

describe("validateChartData", () => {
	it("accepts bar and coerces numeric strings", () => {
		const r = validateChartData("bar", '{"labels":["a","b"],"series":[{"name":"S","values":[1,"2"]}],"unit":"ms"}')
		assert.ok(r.ok)
		assert.deepEqual(r.ok && r.data, { type: "bar", labels: ["a", "b"], series: [{ name: "S", values: [1, 2] }], unit: "ms" })
	})

	it("accepts line, pie and table", () => {
		assert.ok(validateChartData("line", '{"labels":["a"],"series":[{"values":[1]}]}').ok)
		assert.ok(validateChartData("pie", '{"labels":["a","b"],"values":[1,2]}').ok)
		const t = validateChartData("table", '{"columns":["A","B"],"rows":[["x",1],["y",null]]}')
		assert.ok(t.ok)
	})

	it("rejects invalid JSON with an example", () => {
		const r = validateChartData("bar", "{labels: [}")
		assert.ok(!r.ok)
		assert.match(!r.ok ? r.error : "", /not valid JSON/)
		assert.match(!r.ok ? r.error : "", /"series"/)
	})

	it("rejects unknown type", () => {
		const r = validateChartData("radar", "{}")
		assert.ok(!r.ok)
		assert.match(!r.ok ? r.error : "", /bar, line, pie, table/)
	})

	it("rejects mismatched lengths and non-numbers", () => {
		assert.ok(!validateChartData("bar", '{"labels":["a","b"],"series":[{"name":"S","values":[1]}]}').ok)
		assert.ok(!validateChartData("bar", '{"labels":["a"],"series":[{"name":"S","values":["x"]}]}').ok)
		assert.ok(!validateChartData("pie", '{"labels":["a"],"values":[1,2]}').ok)
		assert.ok(!validateChartData("pie", '{"labels":["a"],"values":[0]}').ok)
	})

	it("rejects wrong table shape and too many rows", () => {
		assert.ok(!validateChartData("table", '{"columns":["A","B"],"rows":[["x"]]}').ok)
		assert.ok(!validateChartData("table", '{"columns":[],"rows":[]}').ok)
		const rows = Array.from({ length: 31 }, () => ["x"])
		assert.ok(!validateChartData("table", JSON.stringify({ columns: ["A"], rows })).ok)
	})
})

describe("ShowChartToolHandler", () => {
	it("says chart payload and returns short result", async () => {
		const { config, said } = makeConfig()
		const result = await new ShowChartToolHandler().execute(
			config,
			block({ title: " T ", type: "pie", data: '{"labels":["a","b"],"values":[1,3]}' }),
		)
		assert.equal(said[0].type, "chart")
		assert.deepEqual(JSON.parse(said[0].text!), { title: "T", type: "pie", data: { labels: ["a", "b"], values: [1, 3] } })
		assert.ok(JSON.stringify(result).includes('Chart \\"T\\" shown to the user.'))
	})

	it("returns tool error on bad data and counts a mistake", async () => {
		const { config, said } = makeConfig()
		const result = await new ShowChartToolHandler().execute(config, block({ title: "T", type: "bar", data: "nope" }))
		assert.equal(said.length, 0)
		assert.equal(config.taskState.consecutiveMistakeCount, 1)
		assert.ok(JSON.stringify(result).includes("not valid JSON"))
	})

	it("errors on missing params", async () => {
		const { config, errors } = makeConfig()
		const h = new ShowChartToolHandler()
		await h.execute(config, block({ type: "bar", data: "{}" }))
		await h.execute(config, block({ title: "T", data: "{}" }))
		await h.execute(config, block({ title: "T", type: "bar" }))
		assert.deepEqual(errors, ["title", "type", "data"])
	})
})
