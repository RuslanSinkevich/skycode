/**
 * [SKYCODE] Ветка задачи и коммит на каждый шаг агента.
 *
 * Агент правит файлы сразу, без подтверждения каждого куска. Чтобы изменения
 * было легко смотреть и откатывать в любом git-клиенте:
 *  - при первой правке задачи создаётся ветка `skycode/<задача>-<id>` от текущей
 *    (прямо в рабочей папке; незакоммиченные правки пользователя переезжают с ней);
 *  - каждый ход агента, в котором изменились файлы, — отдельный коммит, в сообщении —
 *    пояснение агента «что и почему» и служебная строка `Skycode-Task: <id>`;
 *  - шаг можно откатить (`git revert`), ветку — слить в базовую (по умолчанию squash).
 *
 * Без зависимостей от VS Code — тестируется на временных репозиториях.
 */
import * as childProcess from "node:child_process"
import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"

export interface AgentGitState {
	branch: string
	baseBranch: string
	baseSha: string
}

export interface StepCommit {
	sha: string
	subject: string
	added: number
	removed: number
	files: number
	reverted: boolean
}

export interface AgentGitReport extends AgentGitState {
	steps: StepCommit[]
}

export interface AgentGitOptions {
	/** Запускать git-хуки на коммитах шагов (по умолчанию нет: это черновики в ветке агента). */
	runHooksOnSteps?: boolean
}

export type CommitStepResult =
	| { status: "committed"; commit: StepCommit; branchCreated: boolean; carriedUserFiles: number }
	| { status: "no-changes" }
	| { status: "branch-not-current"; branch: string; current: string }

export class AgentGitError extends Error {}

const TASK_TRAILER = "Skycode-Task"
const MAX_SUBJECT = 72
const MAX_BODY_LINES = 12
const GIT_TIMEOUT_MS = 60_000

export function runGit(root: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		childProcess.execFile(
			"git",
			args,
			{
				cwd: root,
				maxBuffer: 64 * 1024 * 1024,
				timeout: GIT_TIMEOUT_MS,
				windowsHide: true,
				env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
			},
			(error, stdout, stderr) => {
				if (error) {
					reject(new AgentGitError(`git ${args[0]}: ${(stderr || error.message).trim()}`))
				} else {
					resolve(stdout)
				}
			},
		)
	})
}

const CYRILLIC: Record<string, string> = {
	а: "a",
	б: "b",
	в: "v",
	г: "g",
	д: "d",
	е: "e",
	ё: "e",
	ж: "zh",
	з: "z",
	и: "i",
	й: "y",
	к: "k",
	л: "l",
	м: "m",
	н: "n",
	о: "o",
	п: "p",
	р: "r",
	с: "s",
	т: "t",
	у: "u",
	ф: "f",
	х: "h",
	ц: "c",
	ч: "ch",
	ш: "sh",
	щ: "sch",
	ъ: "",
	ы: "y",
	ь: "",
	э: "e",
	ю: "yu",
	я: "ya",
}

/** `Пеня считается неправильно` → `penya-schitaetsya-nepravilno` (для имени ветки). */
export function slugify(text: string, maxLength = 40): string {
	const translit = [...text.toLowerCase()].map((ch) => CYRILLIC[ch] ?? ch).join("")
	const slug = translit
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, maxLength)
		.replace(/-+$/g, "")
	return slug || "task"
}

export function taskBranchName(taskTitle: string, taskId: string): string {
	return `skycode/${slugify(taskTitle)}-${taskId.slice(-6)}`
}

/**
 * Сообщение коммита из пояснения агента: первая фраза — заголовок (≤72), остальное — тело.
 * Пустое пояснение — заголовок по списку файлов.
 */
export function buildCommitMessage(reason: string, files: string[], stepNumber: number): { subject: string; body: string } {
	const text = reason
		.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/^#+\s*/gm, "")
		.replace(/\*\*|__|`/g, "")
		.trim()
	const fallback = `Шаг ${stepNumber}: ${files
		.slice(0, 3)
		.map((f) => path.posix.basename(f))
		.join(", ")}${files.length > 3 ? ` и ещё ${files.length - 3}` : ""}`
	if (!text) {
		return { subject: fallback, body: "" }
	}
	const lines = text.split(/\r?\n/).map((l) => l.trim())
	const firstLine = lines.find((l) => l.length > 0) ?? ""
	const sentenceEnd = firstLine.search(/[.!?](\s|$)/)
	let subject = sentenceEnd > 0 ? firstLine.slice(0, sentenceEnd) : firstLine
	if (subject.length > MAX_SUBJECT) {
		subject = `${subject.slice(0, MAX_SUBJECT - 1).trimEnd()}…`
	}
	const rest = text.slice(text.indexOf(firstLine) + (sentenceEnd > 0 ? sentenceEnd + 1 : firstLine.length)).trim()
	const bodyLines = rest.split(/\r?\n/).filter((l, i, all) => l.trim() || (i > 0 && all[i - 1].trim()))
	const body = bodyLines.length > MAX_BODY_LINES ? `${bodyLines.slice(0, MAX_BODY_LINES).join("\n")}\n…` : bodyLines.join("\n")
	return { subject: subject || fallback, body: body.trim() }
}

/** `git status --porcelain=v1 -z` → путь → код статуса (для переименований — оба пути). */
export function parseStatusZ(output: string): Map<string, string> {
	const result = new Map<string, string>()
	const parts = output.split("\0")
	for (let i = 0; i < parts.length; i++) {
		const entry = parts[i]
		if (entry.length < 4) {
			continue
		}
		const code = entry.slice(0, 2)
		result.set(entry.slice(3), code)
		if (code[0] === "R" || code[0] === "C") {
			// следующий элемент — исходный путь
			const from = parts[++i]
			if (from) {
				result.set(from, code)
			}
		}
	}
	return result
}

export class AgentGit {
	private snapshot = new Map<string, string>()
	/** Снимок сделан — без него нельзя отличить правки агента от правок пользователя. */
	private turnOpen = false
	/** Файлы, которые были изменены пользователем до первой правки агента. */
	private dirtyAtStart: Set<string> | null = null

	private constructor(
		readonly root: string,
		private readonly taskId: string,
		private readonly taskTitle: string,
		private state: AgentGitState | null,
		private readonly options: AgentGitOptions,
	) {}

	/** null — папка не в git-репозитории (или git недоступен): функция для задачи выключена. */
	static async open(
		cwd: string,
		taskId: string,
		taskTitle: string,
		state?: AgentGitState,
		options: AgentGitOptions = {},
	): Promise<AgentGit | null> {
		try {
			const root = (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim()
			if (!root || isTooBroadRepoRoot(root)) {
				return null
			}
			return new AgentGit(root, taskId, taskTitle, state ?? null, options)
		} catch {
			return null
		}
	}

	getState(): AgentGitState | null {
		return this.state
	}

	/** Запомнить состояние рабочей папки перед ходом агента. */
	async beginTurn(): Promise<void> {
		this.snapshot = await this.workingTreeSignatures()
		this.turnOpen = true
		if (this.dirtyAtStart === null) {
			this.dirtyAtStart = new Set(this.snapshot.keys())
		}
	}

	/** Закоммитить файлы, изменившиеся с начала хода. */
	async commitStep(reason: string): Promise<CommitStepResult> {
		const now = await this.workingTreeSignatures()
		if (!this.turnOpen) {
			// Начало хода не видели (например, задачу продолжили после перезапуска) —
			// всё грязное считаем чужим, коммитим только то, что изменится дальше.
			this.snapshot = now
			this.turnOpen = true
			this.dirtyAtStart ??= new Set(now.keys())
			return { status: "no-changes" }
		}
		const changed = [...new Set([...this.snapshot.keys(), ...now.keys()])].filter(
			(file) => this.snapshot.get(file) !== now.get(file),
		)
		this.snapshot = now
		if (changed.length === 0) {
			return { status: "no-changes" }
		}

		const current = await this.currentBranch()
		let branchCreated = false
		if (!this.state) {
			if (await this.operationInProgress()) {
				throw new AgentGitError("В репозитории идёт слияние, rebase или cherry-pick — ветку задачи не создаю")
			}
			const baseSha = (await runGit(this.root, ["rev-parse", "HEAD"])).trim()
			const branch = await this.freeBranchName(taskBranchName(this.taskTitle, this.taskId))
			await runGit(this.root, ["checkout", "-b", branch])
			this.state = { branch, baseBranch: current === "HEAD" ? baseSha : current, baseSha }
			branchCreated = true
		} else if (current !== this.state.branch) {
			return { status: "branch-not-current", branch: this.state.branch, current }
		}

		await runGit(this.root, ["add", "-A", "--", ...changed])
		const staged = (await runGit(this.root, ["diff", "--cached", "--name-only", "-z"])).split("\0").filter(Boolean)
		if (staged.length === 0) {
			return { status: "no-changes" }
		}

		const stepNumber = (await this.stepShas()).length + 1
		const { subject, body } = buildCommitMessage(reason, staged, stepNumber)
		const args = ["commit", "-q", "-m", subject]
		if (body) {
			args.push("-m", body)
		}
		args.push("-m", `${TASK_TRAILER}: ${this.taskId}`)
		if (!this.options.runHooksOnSteps) {
			args.push("--no-verify")
		}
		await runGit(this.root, args)

		const sha = (await runGit(this.root, ["rev-parse", "HEAD"])).trim()
		const carriedUserFiles = branchCreated ? [...(this.dirtyAtStart ?? [])].filter((f) => !staged.includes(f)).length : 0
		return { status: "committed", commit: await this.describeCommit(sha), branchCreated, carriedUserFiles }
	}

	/** Шаги задачи: коммиты ветки после базы с нашей служебной строкой (новые — последними). */
	async report(): Promise<AgentGitReport | null> {
		if (!this.state) {
			return null
		}
		const shas = await this.stepShas()
		const reverted = await this.revertedShas()
		const steps: StepCommit[] = []
		for (const sha of shas) {
			const commit = await this.describeCommit(sha)
			commit.reverted = reverted.has(sha)
			steps.push(commit)
		}
		return { ...this.state, steps }
	}

	/** Файлы, изменённые в ветке относительно базы (для просмотра диффа). */
	async changedFiles(): Promise<Array<{ status: string; path: string }>> {
		if (!this.state) {
			return []
		}
		const out = await runGit(this.root, ["diff", "--name-status", "-z", `${this.state.baseSha}`, this.state.branch])
		const parts = out.split("\0").filter(Boolean)
		const files: Array<{ status: string; path: string }> = []
		for (let i = 0; i < parts.length; i++) {
			const status = parts[i]
			if (status.startsWith("R") || status.startsWith("C")) {
				files.push({ status: status[0], path: parts[i + 2] })
				i += 2
			} else {
				files.push({ status: status[0], path: parts[++i] })
			}
		}
		return files
	}

	async revertStep(sha: string): Promise<void> {
		const state = this.requireState()
		if ((await this.currentBranch()) !== state.branch) {
			throw new AgentGitError(`Откат шага возможен только в ветке ${state.branch}`)
		}
		if (!(await this.stepShas()).includes(sha)) {
			throw new AgentGitError("Это не шаг текущей задачи")
		}
		try {
			await runGit(this.root, ["revert", "--no-edit", sha])
		} catch (error) {
			await runGit(this.root, ["revert", "--abort"]).catch(() => undefined)
			throw new AgentGitError(`Шаг не откатывается без конфликтов: ${(error as Error).message}`)
		}
	}

	/**
	 * Слить ветку задачи в базовую. squash — одним коммитом (хуки запускаются как обычно).
	 * При конфликте всё возвращается как было.
	 */
	async merge(squash: boolean, message: string): Promise<void> {
		const state = this.requireState()
		if (/^[0-9a-f]{40}$/.test(state.baseBranch)) {
			throw new AgentGitError("Задача начиналась без ветки (detached HEAD) — слейте вручную")
		}
		await runGit(this.root, ["checkout", state.baseBranch])
		try {
			if (squash) {
				await runGit(this.root, ["merge", "--squash", state.branch])
				const staged = (await runGit(this.root, ["diff", "--cached", "--name-only"])).trim()
				if (staged) {
					await runGit(this.root, ["commit", "-q", "-m", message, "-m", `Skycode: ветка ${state.branch}`])
				}
			} else {
				await runGit(this.root, ["merge", "--no-ff", "-m", message, state.branch])
			}
		} catch (error) {
			await runGit(this.root, ["merge", "--abort"]).catch(() =>
				runGit(this.root, ["reset", "--merge"]).catch(() => undefined),
			)
			await runGit(this.root, ["checkout", state.branch]).catch(() => undefined)
			throw new AgentGitError(`Слить не получилось: ${(error as Error).message}`)
		}
	}

	/** Удалить ветку задачи (если она текущая — сначала вернуться на базовую). */
	async deleteBranch(): Promise<void> {
		const state = this.requireState()
		if ((await this.currentBranch()) === state.branch) {
			await runGit(this.root, ["checkout", state.baseBranch])
		}
		await runGit(this.root, ["branch", "-D", state.branch])
		this.state = null
	}

	// --- внутреннее -------------------------------------------------------

	private requireState(): AgentGitState {
		if (!this.state) {
			throw new AgentGitError("У задачи ещё нет ветки")
		}
		return this.state
	}

	private async currentBranch(): Promise<string> {
		return (await runGit(this.root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()
	}

	private async freeBranchName(name: string): Promise<string> {
		for (let i = 0; ; i++) {
			const candidate = i === 0 ? name : `${name}-${i + 1}`
			try {
				await runGit(this.root, ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}`])
			} catch {
				return candidate
			}
		}
	}

	private async operationInProgress(): Promise<boolean> {
		for (const marker of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply"]) {
			const markerPath = (await runGit(this.root, ["rev-parse", "--git-path", marker])).trim()
			if (fs.existsSync(path.resolve(this.root, markerPath))) {
				return true
			}
		}
		return false
	}

	private async stepShas(): Promise<string[]> {
		if (!this.state) {
			return []
		}
		const out = await runGit(this.root, [
			"log",
			"--reverse",
			"--format=%H",
			`--grep=^${TASK_TRAILER}: ${this.taskId}$`,
			`${this.state.baseSha}..${this.state.branch}`,
		])
		return out.split(/\r?\n/).filter(Boolean)
	}

	/** Шаги, откаченные коммитами `git revert` в той же ветке. */
	private async revertedShas(): Promise<Set<string>> {
		if (!this.state) {
			return new Set()
		}
		const out = await runGit(this.root, ["log", "--format=%B", `${this.state.baseSha}..${this.state.branch}`])
		return new Set([...out.matchAll(/This reverts commit ([0-9a-f]{40})/g)].map((m) => m[1]))
	}

	private async describeCommit(sha: string): Promise<StepCommit> {
		const subject = (await runGit(this.root, ["log", "-1", "--format=%s", sha])).trim()
		const numstat = await runGit(this.root, ["show", "--numstat", "--format=", sha])
		let added = 0
		let removed = 0
		let files = 0
		for (const line of numstat.split(/\r?\n/)) {
			const [a, r] = line.split("\t")
			if (a === undefined || r === undefined) {
				continue
			}
			files++
			added += Number.parseInt(a, 10) || 0
			removed += Number.parseInt(r, 10) || 0
		}
		return { sha, subject, added, removed, files, reverted: false }
	}

	/** Путь → «статус + хэш содержимого» для всех изменённых/новых файлов. */
	private async workingTreeSignatures(): Promise<Map<string, string>> {
		const status = parseStatusZ(await runGit(this.root, ["status", "--porcelain=v1", "-z", "-uall"]))
		const signatures = new Map<string, string>()
		for (const [file, code] of status) {
			signatures.set(file, `${code}:${hashFile(path.join(this.root, file))}`)
		}
		return signatures
	}
}

/**
 * Репозиторий в домашней папке или в корне диска (случайный `git init` в профиле):
 * папка без своего git оказалась бы внутри него, и агент начал бы ветки там.
 */
export function isTooBroadRepoRoot(root: string): boolean {
	const normalize = (p: string) =>
		path
			.resolve(p)
			.replace(/[\\/]+$/, "")
			.toLowerCase()
	const resolved = normalize(root)
	return resolved === normalize(os.homedir()) || resolved === normalize(path.parse(path.resolve(root)).root)
}

function hashFile(filePath: string): string {
	try {
		const stat = fs.statSync(filePath)
		if (!stat.isFile()) {
			return "dir"
		}
		return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex")
	} catch {
		return "missing"
	}
}
