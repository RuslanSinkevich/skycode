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
	MAX_PROBATION_ENTRIES,
	MAX_WRITES_PER_TASK,
	type MemoryFile,
	noteTaskStarted,
	parseMemoryFile,
	type RememberContext,
	renderMemoryForPrompt,
} from "../memory"
import { MemoryStore } from "../MemoryStore"

const NOW = new Date("2026-11-04T10:00:00Z")
let counter = 0
const ctx = (over: Partial<RememberContext> = {}): RememberContext => ({
	taskId: "t1",
	cwd: "D:/proj",
	userTexts: ["Отвечай коротко, без длинных отчётов. И не соглашайся по умолчанию."],
	writesInTask: 0,
	now: NOW,
	newId: () => `m${++counter}`,
	...over,
})

function remember(file: MemoryFile, fact: string, evidence: string, over: Partial<RememberContext> = {}, type = "preference") {
	return applyRemember(file, { fact, type, scope: "global", evidence }, ctx(over))
}

describe("memory: applyRemember", () => {
	it("saves a new fact as probation when evidence is the user's words", () => {
		const r = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		r.ok.should.equal(true)
		if (!r.ok) return
		r.action.should.equal("added")
		r.entry.status.should.equal("probation")
		r.entry.scope.should.equal("global")
		r.entry.created.should.equal("2026-11-04")
		r.file.entries.length.should.equal(1)
	})

	it("accepts evidence with changed word order or punctuation", () => {
		evidenceMatches("без длинных отчётов, коротко отвечай", ["Отвечай коротко, без длинных отчётов."]).should.equal(true)
	})

	it("rejects evidence that is not in the user's messages", () => {
		const r = remember(emptyMemoryFile(), "Любит табы", "используй табы вместо пробелов")
		r.ok.should.equal(false)
	})

	it("rejects a single-word evidence that is not an exact phrase", () => {
		evidenceMatches("табы", ["Отвечай коротко"]).should.equal(false)
	})

	it("rejects unknown type, too long fact and secrets", () => {
		remember(emptyMemoryFile(), "x", "отвечай коротко", {}, "opinion").ok.should.equal(false)
		remember(emptyMemoryFile(), "a".repeat(201), "отвечай коротко").ok.should.equal(false)
		const secret = remember(emptyMemoryFile(), "Ключ API: sk-abcdefghijklmnopqrstuvwx", "отвечай коротко")
		secret.ok.should.equal(false)
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
		let file = emptyMemoryFile()
		for (let i = 0; i < MAX_PROBATION_ENTRIES; i++) {
			file.entries.push({
				id: `old${i}`,
				type: "event",
				scope: "global",
				text: `событие номер ${i} уникальное слово${i}`,
				status: "probation",
				created: `2026-10-${String(10 + i).padStart(2, "0")}`,
				updated: `2026-10-${String(10 + i).padStart(2, "0")}`,
				sourceTask: "t0",
				seenInTasks: [],
			})
		}
		const r = remember(file, "Предпочитает короткие ответы", "отвечай коротко")
		if (!r.ok) throw new Error("not saved")
		file = r.file
		file.entries.length.should.equal(MAX_PROBATION_ENTRIES)
		file.entries.some((e) => e.id === "old0").should.equal(false)
	})

	it("project scope stores the workspace path and is hidden in other folders", () => {
		const r = applyRemember(
			emptyMemoryFile(),
			{ fact: "Отчёты без воды", type: "project", scope: "project", evidence: "без длинных отчётов" },
			ctx(),
		)
		if (!r.ok) throw new Error("not saved")
		r.entry.scope.should.equal("D:/proj")
		renderMemoryForPrompt(r.file, "D:\\proj\\").should.containEql("Отчёты без воды")
		renderMemoryForPrompt(r.file, "D:/other").should.equal("")
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
		const { file, removed } = applyForget(r.file, `[${r.entry.id}]`.slice(1, -1))
		removed!.id.should.equal(r.entry.id)
		file.entries.length.should.equal(0)
		applyRestore(file, r.entry).entries.length.should.equal(1)
	})

	it("renders confirmed and unconfirmed sections separately", () => {
		const r = remember(emptyMemoryFile(), "Предпочитает короткие ответы", "отвечай коротко")
		if (!r.ok) throw new Error("not saved")
		const text = renderMemoryForPrompt(r.file, "D:/proj")
		text.should.startWith("## MEMORY")
		text.should.containEql("Unconfirmed")
		text.should.not.containEql("Confirmed:")
		text.should.containEql(`[${r.entry.id}]`)
		renderMemoryForPrompt(emptyMemoryFile(), "D:/proj").should.equal("")
	})

	it("parse survives broken JSON and drops invalid entries", () => {
		parseMemoryFile("{oops").entries.length.should.equal(0)
		const parsed = parseMemoryFile(JSON.stringify({ entries: [{ id: "a", text: "ok" }, { id: 1 }, { id: "b", text: "  " }] }))
		parsed.entries.length.should.equal(1)
		parsed.entries[0].status.should.equal("probation")
	})

	it("secret filter does not flag ordinary paths and dates", () => {
		containsSecret("Код лежит в src/core/prompts/system-prompt/variants/qwen").should.equal(false)
		containsSecret("Токен истекает 2026-12-01").should.equal(false)
		containsSecret("password: hunter2hunter").should.equal(true)
	})
})

describe("MemoryStore", () => {
	it("persists to disk and serializes concurrent writes", async () => {
		const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skycode-memory-"))
		try {
			const store = MemoryStore.forDirectory(dir)
			const base = { cwd: "D:/proj", userTexts: ["Отвечай коротко. Меня зовут Руслан. Работаю над Skycode."] }
			const results = await Promise.all([
				store.remember(
					{ fact: "Предпочитает короткие ответы", type: "preference", scope: "global", evidence: "отвечай коротко" },
					{ ...base, taskId: "a" },
				),
				store.remember(
					{ fact: "Зовут Руслан", type: "user", scope: "global", evidence: "меня зовут руслан" },
					{ ...base, taskId: "b" },
				),
			])
			results.every((r) => r.ok).should.equal(true)
			const reread = MemoryStore.forDirectory(dir)
			;(await reread.list()).length.should.equal(2)
		} finally {
			await fs.rm(dir, { recursive: true, force: true })
		}
	})
})
