import { describe, it } from "mocha"
import "should"
import * as fs from "fs/promises"
import * as os from "os"
import * as path from "path"
import {
	applyForget,
	applyRemember,
	applyRestore,
	containsSecret,
	emptyMemoryFile,
	evidenceMatches,
	extractUserWords,
	MAX_PROBATION_PER_FILE,
	MAX_WRITES_PER_TASK,
	type MemoryFile,
	noteTaskStarted,
	parseMemoryFile,
	type RememberContext,
	renderMemoryForPrompt,
	scopeOfType,
} from "../memory"
import { MemoryStore, projectMemoryFileName } from "../MemoryStore"

const NOW = new Date("2026-11-04T10:00:00Z")
let counter = 0
const ctx = (over: Partial<RememberContext> = {}): RememberContext => ({
	taskId: "t1",
	userTexts: ["Отвечай коротко, без длинных отчётов. И не соглашайся по умолчанию."],
	writesInTask: 0,
	now: NOW,
	newId: () => `m${++counter}`,
	...over,
})

function remember(file: MemoryFile, fact: string, evidence: string, over: Partial<RememberContext> = {}, type = "preference") {
	return applyRemember(file, { fact, type, evidence }, ctx(over))
}

describe("memory: applyRemember", () => {
	it("saves a new fact as probation when evidence is the user's words", () => {
		const r = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		r.ok.should.equal(true)
		if (!r.ok) return
		r.action.should.equal("added")
		r.entry.status.should.equal("probation")
		r.entry.created.should.equal("2026-11-04")
		r.file.entries.length.should.equal(1)
	})

	it("accepts evidence with changed word order or punctuation", () => {
		evidenceMatches("без длинных отчётов, коротко отвечай", ["Отвечай коротко, без длинных отчётов."]).should.equal(true)
	})

	it("rejects evidence that is not in the user's messages", () => {
		remember(emptyMemoryFile(), "Любит табы", "используй табы вместо пробелов").ok.should.equal(false)
	})

	it("rejects a single-word evidence that is not an exact phrase", () => {
		evidenceMatches("табы", ["Отвечай коротко"]).should.equal(false)
	})

	it("rejects unknown or removed types, too long fact and secrets", () => {
		remember(emptyMemoryFile(), "x", "отвечай коротко", {}, "opinion").ok.should.equal(false)
		remember(emptyMemoryFile(), "x", "отвечай коротко", {}, "event").ok.should.equal(false)
		remember(emptyMemoryFile(), "a".repeat(161), "отвечай коротко").ok.should.equal(false)
		remember(emptyMemoryFile(), "Ключ API: sk-abcdefghijklmnopqrstuvwx", "отвечай коротко").ok.should.equal(false)
	})

	it("enforces the per-task write limit", () => {
		remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко", {
			writesInTask: MAX_WRITES_PER_TASK,
		}).ok.should.equal(false)
	})

	it("treats a similar fact as an update, keeping the id", () => {
		const first = remember(emptyMemoryFile(), "Предпочитает короткие ответы без отчётов", "отвечай коротко")
		if (!first.ok) throw new Error("first not saved")
		const second = remember(first.file, "Предпочитает короткие ответы без длинных отчётов", "без длинных отчётов")
		second.ok.should.equal(true)
		if (!second.ok) return
		second.action.should.equal("updated")
		second.entry.id.should.equal(first.entry.id)
		second.previous!.text.should.equal("Предпочитает короткие ответы без отчётов")
		second.file.entries.length.should.equal(1)
	})

	it("confirms a probation fact when it is said again in another task", () => {
		const first = remember(emptyMemoryFile(), "Предпочитает короткие ответы без отчётов", "отвечай коротко")
		if (!first.ok) throw new Error("first not saved")
		const again = remember(first.file, "Предпочитает короткие ответы без длинных отчётов", "отвечай коротко", {
			taskId: "t2",
		})
		if (!again.ok) throw new Error("not saved")
		again.action.should.equal("confirmed")
		again.entry.status.should.equal("stable")
	})

	it("evicts the oldest probation entry when probation is full", () => {
		const file = emptyMemoryFile()
		for (let i = 0; i < MAX_PROBATION_PER_FILE; i++) {
			file.entries.push({
				id: `old${i}`,
				type: "user",
				text: `событие номер ${i} уникальное слово${i}`,
				status: "probation",
				created: `2026-10-1${i}`,
				updated: `2026-10-1${i}`,
				sourceTask: "t0",
				seenInTasks: [],
			})
		}
		const r = remember(file, "Предпочитает короткие ответы", "отвечай коротко")
		if (!r.ok) throw new Error("not saved")
		r.file.entries.length.should.equal(MAX_PROBATION_PER_FILE)
		r.file.entries.some((e) => e.id === "old0").should.equal(false)
	})

	it("scope follows the type: only project goes to the project memory", () => {
		scopeOfType("user").should.equal("global")
		scopeOfType("preference").should.equal("global")
		scopeOfType("project").should.equal("project")
	})
})

describe("memory: promotion", () => {
	it("becomes stable after two other tasks, not counting its own or repeated tasks", () => {
		const r = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		if (!r.ok) throw new Error("not saved")
		let file = r.file
		;(noteTaskStarted(file, "t1") === null).should.equal(true) // своя задача не считается
		file = noteTaskStarted(file, "t2")!
		file.entries[0].status.should.equal("probation")
		;(noteTaskStarted(file, "t2") === null).should.equal(true) // повтор той же задачи
		file = noteTaskStarted(file, "t3")!
		file.entries[0].status.should.equal("stable")
	})
})

describe("memory: forget, restore, render, parse", () => {
	it("forget removes by id and restore brings back the previous text", () => {
		const r = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		if (!r.ok) throw new Error("not saved")
		const { file, removed } = applyForget(r.file, r.entry.id)
		removed!.id.should.equal(r.entry.id)
		file.entries.length.should.equal(0)
		applyRestore(file, r.entry).entries.length.should.equal(1)
	})

	it("renders the user and project sections, marking unconfirmed entries", () => {
		const g = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		if (!g.ok) throw new Error("not saved")
		const p = applyRemember(
			emptyMemoryFile(),
			{ fact: "Здесь отчёты без воды", type: "project", evidence: "без длинных отчётов" },
			ctx(),
		)
		if (!p.ok) throw new Error("not saved")
		const text = renderMemoryForPrompt(g.file, p.file)
		text.should.startWith("## MEMORY")
		text.should.containEql("About the user (all projects):")
		text.should.containEql("This project:")
		text.should.containEql(`- [${g.entry.id}] Предпочитает короткие ответы (unconfirmed)`)
		renderMemoryForPrompt(g.file, emptyMemoryFile()).should.not.containEql("This project:")
		renderMemoryForPrompt(emptyMemoryFile(), emptyMemoryFile()).should.equal("")
	})

	it("parse survives broken JSON, drops invalid entries and maps the old event type to project", () => {
		parseMemoryFile("{oops").entries.length.should.equal(0)
		const parsed = parseMemoryFile(
			JSON.stringify({
				entries: [{ id: "a", text: "ok" }, { id: 1 }, { id: "b", text: "  " }, { id: "c", text: "срок", type: "event" }],
			}),
		)
		parsed.entries.length.should.equal(2)
		parsed.entries[0].status.should.equal("probation")
		parsed.entries[1].type.should.equal("project")
	})

	it("secret filter does not flag ordinary paths and dates", () => {
		containsSecret("Код лежит в src/core/prompts/system-prompt/variants/qwen").should.equal(false)
		containsSecret("Токен истекает 2026-12-01").should.equal(false)
		containsSecret("password: hunter2hunter").should.equal(true)
	})
})

describe("memory: extractUserWords", () => {
	it("takes only the user's words from task, feedback, answer and continuation tags", () => {
		const words = extractUserWords([
			"<task>\nМеня зовут Руслан, я разрабатываю Skycode.\n</task>",
			"<environment_details>\n# Current Mode\nACT MODE\n</environment_details>",
			"[list_files for '.'] Result:\nREADME.md",
			"[ask_followup_question] Result:\n<answer>\nДа, отвечай коротко\n</answer>",
			"<feedback>\nне так</feedback>",
			"<user_message>\nпродолжай</user_message>",
		])
		words.should.eql(["Меня зовут Руслан, я разрабатываю Skycode.", "Да, отвечай коротко", "не так", "продолжай"])
		evidenceMatches("Меня зовут Руслан, я разрабатываю Skycode", words).should.equal(true)
		evidenceMatches("README.md", words).should.equal(false)
	})
})

describe("MemoryStore", () => {
	const withDir = async (run: (dir: string) => Promise<void>) => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-memory-"))
		try {
			await run(dir)
		} finally {
			await fs.rm(dir, { recursive: true, force: true })
		}
	}
	const texts = ["Отвечай коротко. Меня зовут Руслан. В этом проекте отступы табами."]

	it("writes user facts to global.json and project facts to the project file, serializing writes", async () => {
		await withDir(async (dir) => {
			const store = MemoryStore.forDirectory(dir)
			const results = await Promise.all([
				store.remember(
					{ fact: "Зовут Руслан", type: "user", evidence: "меня зовут руслан" },
					{ taskId: "a", cwd: "D:/proj", userTexts: texts },
				),
				store.remember(
					{ fact: "Отступы табами", type: "project", evidence: "в этом проекте отступы табами" },
					{ taskId: "b", cwd: "D:/proj", userTexts: texts },
				),
			])
			results.every((r) => r.ok).should.equal(true)
			const reread = MemoryStore.forDirectory(dir)
			const here = await reread.list("D:/proj")
			here.global.map((e) => e.text).should.eql(["Зовут Руслан"])
			here.project.map((e) => e.text).should.eql(["Отступы табами"])
			const elsewhere = await reread.list("D:/other")
			elsewhere.global.length.should.equal(1)
			elsewhere.project.length.should.equal(0)
			const projectFile = JSON.parse(
				await fs.readFile(path.join(dir, "projects", projectMemoryFileName("D:/proj")), "utf8"),
			)
			projectFile.workspace.should.equal("D:/proj")
		})
	})

	it("forget finds the entry in either memory", async () => {
		await withDir(async (dir) => {
			const store = MemoryStore.forDirectory(dir)
			const r = await store.remember(
				{ fact: "Отступы табами", type: "project", evidence: "в этом проекте отступы табами" },
				{ taskId: "a", cwd: "D:/proj", userTexts: texts },
			)
			if (!r.ok) throw new Error("not saved")
			;(await store.forget(r.entry.id, "D:/proj"))!.text.should.equal("Отступы табами")
			;(await store.list("D:/proj")).project.length.should.equal(0)
		})
	})

	it("migrates the old single memory.json into global and project files", async () => {
		await withDir(async (dir) => {
			const old = {
				version: 1,
				entries: [
					{
						id: "g1",
						type: "user",
						scope: "global",
						text: "Зовут Руслан",
						status: "stable",
						created: "2026-11-04",
						updated: "2026-11-04",
						sourceTask: "x",
						seenInTasks: [],
					},
					{
						id: "p1",
						type: "project",
						scope: "D:/proj",
						text: "Отступы табами",
						status: "probation",
						created: "2026-11-04",
						updated: "2026-11-04",
						sourceTask: "x",
						seenInTasks: [],
					},
				],
			}
			await fs.writeFile(path.join(dir, "memory.json"), JSON.stringify(old), "utf8")
			const store = MemoryStore.forDirectory(dir)
			const here = await store.list("D:/proj")
			here.global.map((e) => e.id).should.eql(["g1"])
			here.project.map((e) => e.id).should.eql(["p1"])
			await fs.access(path.join(dir, "memory.json.migrated"))
		})
	})

	it("renders an empty-memory section when nothing is saved", async () => {
		await withDir(async (dir) => {
			;(await MemoryStore.forDirectory(dir).renderForPrompt("D:/proj")).should.startWith(
				"## MEMORY\n\nNothing remembered yet",
			)
		})
	})
})
