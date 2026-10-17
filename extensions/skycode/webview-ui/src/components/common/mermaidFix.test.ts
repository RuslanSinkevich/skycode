import { describe, expect, it } from "vitest"
import { quoteMermaidLabels } from "./mermaidFix"

describe("quoteMermaidLabels", () => {
	it("quotes edge and node labels with special characters", () => {
		const code =
			"graph TD\n    FF1 -->|typeof(RegIncoming)| RI\n    M -->|MDI Parent| RI[RegIncoming : Form]\n    A{x: y} --> B(call(1))"
		expect(quoteMermaidLabels(code)).toBe(
			'graph TD\n    FF1 -->|"typeof(RegIncoming)"| RI\n    M -->|MDI Parent| RI["RegIncoming : Form"]\n    A{"x: y"} --> B(call(1))',
		)
	})

	it("does not touch special node shapes", () => {
		const code = "graph TD\n    A[(database)] --> B[[sub: x]]\n    C{{hex: y}} --> D([stadium: z])\n    E[/par: x/] --> F[\\alt: y\\]"
		expect(quoteMermaidLabels(code)).toBe(code)
	})

	it("leaves plain labels, quoted labels and non-flowchart diagrams alone", () => {
		const plain = 'graph TD\n    A[Program.cs] -->|создаёт| B["already (quoted)"]'
		expect(quoteMermaidLabels(plain)).toBe(plain)
		const sequence = "sequenceDiagram\n    A->>B: call(1)"
		expect(quoteMermaidLabels(sequence)).toBe(sequence)
	})
})
