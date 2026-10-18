import { describe, expect, it } from "vitest"
import { fixMermaidStyleContrast, quoteMermaidLabels } from "./mermaidFix"

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

describe("fixMermaidStyleContrast", () => {
	it("adds a readable text color to filled nodes without one", () => {
		const code = "graph TD\n  style FF fill:#fff3e0,stroke:#e65100\n  classDef dark fill:#1a237e\n  style B fill:#fff,color:#333"
		expect(fixMermaidStyleContrast(code)).toBe(
			"graph TD\n  style FF fill:#fff3e0,stroke:#e65100,color:#1e1e1e\n  classDef dark fill:#1a237e,color:#f3f3f3\n  style B fill:#fff,color:#333",
		)
	})

	it("leaves non-hex fills and other lines alone", () => {
		const code = "graph TD\n  A --> B\n  style A fill:red"
		expect(fixMermaidStyleContrast(code)).toBe(code)
	})
})
