import { expect } from "chai"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { getRuleFilesTotalContentWithMetadata } from "../rule-helpers"

describe("rule loading with paths frontmatter", () => {
	it("filters rules by evaluationContext.paths", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			await fs.writeFile(path.join(rulesDir, "universal.md"), "Always on")
			await fs.writeFile(path.join(rulesDir, "scoped.md"), `---\npaths:\n  - "src/**"\n---\n\nOnly for src`)

			const files = ["universal.md", "scoped.md"]
			const toggles: Record<string, boolean> = {
				[path.join(rulesDir, "universal.md")]: true,
				[path.join(rulesDir, "scoped.md")]: true,
			}

			const res1 = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["src/index.ts"] },
			})
			expect(res1.content).to.contain("universal.md")
			expect(res1.content).to.contain("scoped.md")
			expect(res1.content).to.not.contain("paths:")
			expect(res1.activatedConditionalRules.map((r) => r.name)).to.include("global:scoped.md")

			const res2 = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["docs/readme.md"] },
			})
			expect(res2.content).to.contain("universal.md")
			expect(res2.content).to.not.contain("scoped.md")
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})

	// [SKYCODE] Правила с `priority: critical` повторяются в environment_details каждое сообщение.
	it("собирает в criticalContent только правила с priority: critical", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			await fs.writeFile(path.join(rulesDir, "plain.md"), "Обычное правило")
			await fs.writeFile(path.join(rulesDir, "main.md"), `---\npriority: critical\n---\n\nСначала план, потом файлы`)
			await fs.writeFile(path.join(rulesDir, "loud.md"), `---\npriority: CRITICAL\n---\n\nРегистр не важен`)
			// Критичное, но отфильтрованное по paths — в повтор попадать не должно
			await fs.writeFile(
				path.join(rulesDir, "scoped.md"),
				`---\npriority: critical\npaths:\n  - "src/**"\n---\n\nТолько для src`,
			)

			const files = ["plain.md", "main.md", "loud.md", "scoped.md"]
			const toggles: Record<string, boolean> = Object.fromEntries(files.map((f) => [path.join(rulesDir, f), true]))

			const res = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["docs/readme.md"] },
			})

			expect(res.criticalContent).to.contain("Сначала план, потом файлы")
			expect(res.criticalContent).to.contain("Регистр не важен")
			expect(res.criticalContent).to.not.contain("Обычное правило")
			expect(res.criticalContent).to.not.contain("Только для src")
			// В повторе не должно быть ни имён файлов, ни самого frontmatter
			expect(res.criticalContent).to.not.contain("main.md")
			expect(res.criticalContent).to.not.contain("priority:")
			// Полный список правил при этом собирается как раньше
			expect(res.content).to.contain("Обычное правило")
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})

	it("не возвращает criticalContent, когда критичных правил нет", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			await fs.writeFile(path.join(rulesDir, "plain.md"), "Обычное правило")

			const res = await getRuleFilesTotalContentWithMetadata(["plain.md"], rulesDir, {
				[path.join(rulesDir, "plain.md")]: true,
			})

			expect(res.criticalContent).to.equal(undefined)
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})

	it("treats invalid YAML frontmatter as fail-open and preserves the raw frontmatter for the LLM", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			// Intentionally invalid YAML (unquoted '*' is a YAML alias indicator)
			await fs.writeFile(
				path.join(rulesDir, "invalid.md"),
				`---\npaths: *\n---\n\nInvalid YAML, but should still be included`,
			)

			const files = ["invalid.md"]
			const toggles: Record<string, boolean> = {
				[path.join(rulesDir, "invalid.md")]: true,
			}

			const res = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["src/index.ts"] },
			})

			// Fail-open: included even though frontmatter cannot be parsed.
			expect(res.content).to.contain("invalid.md")
			// Preserve raw frontmatter fence/content for the LLM.
			expect(res.content).to.contain("---")
			expect(res.content).to.contain("paths:")
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})

	it("treats paths: [] as match-nothing (fail-closed)", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			await fs.writeFile(path.join(rulesDir, "scoped-empty.md"), `---\npaths: []\n---\n\nShould never activate`)

			const files = ["scoped-empty.md"]
			const toggles: Record<string, boolean> = {
				[path.join(rulesDir, "scoped-empty.md")]: true,
			}

			const res = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["src/index.ts"] },
			})

			expect(res.content).to.not.contain("scoped-empty.md")
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})

	it("keeps activatedConditionalRules order stable (matches input file order)", async () => {
		const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-rules-test-"))
		try {
			const rulesDir = path.join(tmp, ".skycoderules")
			await fs.mkdir(rulesDir, { recursive: true })
			await fs.writeFile(path.join(rulesDir, "a.md"), `---\npaths:\n  - "src/**"\n---\n\nA`)
			await fs.writeFile(path.join(rulesDir, "b.md"), `---\npaths:\n  - "src/**"\n---\n\nB`)
			await fs.writeFile(path.join(rulesDir, "c.md"), `---\npaths:\n  - "src/**"\n---\n\nC`)

			const files = ["a.md", "b.md", "c.md"]
			const toggles: Record<string, boolean> = {
				[path.join(rulesDir, "a.md")]: true,
				[path.join(rulesDir, "b.md")]: true,
				[path.join(rulesDir, "c.md")]: true,
			}

			const res = await getRuleFilesTotalContentWithMetadata(files, rulesDir, toggles, {
				evaluationContext: { paths: ["src/index.ts"] },
			})

			expect(res.activatedConditionalRules.map((r) => r.name)).to.deep.equal(files.map((f) => `global:${f}`))
		} finally {
			await fs.rm(tmp, { recursive: true, force: true })
		}
	})
})
