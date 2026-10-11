// [SKYCODE] Ветка задачи и коммиты шагов — на временных git-репозиториях.
import "should"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { AgentGit, buildCommitMessage, isTooBroadRepoRoot, parseStatusZ, runGit, slugify, taskBranchName } from "../AgentGit"

async function makeRepo(): Promise<string> {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skycode-agentgit-"))
	await runGit(dir, ["init", "-q", "-b", "main"])
	await runGit(dir, ["config", "user.email", "test@example.com"])
	await runGit(dir, ["config", "user.name", "Test"])
	await runGit(dir, ["config", "commit.gpgsign", "false"])
	await runGit(dir, ["config", "core.autocrlf", "false"])
	fs.writeFileSync(path.join(dir, "a.txt"), "one\n")
	fs.writeFileSync(path.join(dir, "b.txt"), "bee\n")
	await runGit(dir, ["add", "."])
	await runGit(dir, ["commit", "-q", "-m", "init"])
	return dir
}

const write = (dir: string, file: string, text: string) => {
	fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true })
	fs.writeFileSync(path.join(dir, file), text)
}
const branchOf = async (dir: string) => (await runGit(dir, ["rev-parse", "--abbrev-ref", "HEAD"])).trim()

describe("AgentGit helpers", () => {
	it("transliterates task titles into branch names", () => {
		slugify("Пеня считается неправильно!").should.equal("penya-schitaetsya-nepravilno")
		slugify("???").should.equal("task")
		taskBranchName("Fix login", "1728123456789").should.equal("skycode/fix-login-456789")
	})

	it("builds subject and body from the agent's explanation", () => {
		const msg = buildCommitMessage("Добавлю проверку на пустую дату. Иначе **CalculatePenalty** падает.\nПроверил на трёх договорах.", ["a.cs"], 1)
		msg.subject.should.equal("Добавлю проверку на пустую дату")
		msg.body.should.equal("Иначе CalculatePenalty падает.\nПроверил на трёх договорах.")
	})

	it("falls back to file names and trims long subjects", () => {
		buildCommitMessage("", ["src/a.cs", "src/b.cs", "c.cs", "d.cs"], 3).subject.should.equal("Шаг 3: a.cs, b.cs, c.cs и ещё 1")
		buildCommitMessage("x".repeat(100), ["a"], 1).subject.length.should.equal(72)
	})

	it("refuses repositories rooted at the home folder or a drive root", () => {
		isTooBroadRepoRoot(os.homedir()).should.be.true()
		isTooBroadRepoRoot(path.parse(process.cwd()).root).should.be.true()
		isTooBroadRepoRoot(path.join(os.homedir(), "projects", "app")).should.be.false()
	})

	it("parses porcelain -z output including renames", () => {
		const parsed = parseStatusZ(" M a.txt\0R  new.txt\0old.txt\0?? dir/с пробелом.txt\0")
		;[...parsed.entries()].should.deepEqual([
			["a.txt", " M"],
			["new.txt", "R "],
			["old.txt", "R "],
			["dir/с пробелом.txt", "??"],
		])
	})
})

describe("AgentGit", function () {
	this.timeout(30_000)
	let dir: string

	beforeEach(async () => {
		dir = await makeRepo()
	})
	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("returns null outside a git repository", async () => {
		const plain = fs.mkdtempSync(path.join(os.tmpdir(), "skycode-plain-"))
		try {
			;((await AgentGit.open(plain, "1", "t")) === null).should.be.true()
		} finally {
			fs.rmSync(plain, { recursive: true, force: true })
		}
	})

	it("creates the task branch lazily and commits each step", async () => {
		const git = (await AgentGit.open(dir, "1700000000001", "Пеня"))!
		await git.beginTurn()
		;(await git.commitStep("Только читал файлы.")).status.should.equal("no-changes")
		;(await branchOf(dir)).should.equal("main")

		await git.beginTurn()
		write(dir, "a.txt", "one\ntwo\n")
		write(dir, "src/new.cs", "class A {}\n")
		const first = await git.commitStep("Добавил вторую строку. Нужна для теста.")
		first.status.should.equal("committed")
		if (first.status !== "committed") throw new Error()
		first.branchCreated.should.be.true()
		first.commit.files.should.equal(2)
		;(await branchOf(dir)).should.equal("skycode/penya-000001")

		await git.beginTurn()
		fs.unlinkSync(path.join(dir, "b.txt"))
		;(await git.commitStep("Удалил b.txt")).status.should.equal("committed")

		const report = (await git.report())!
		report.baseBranch.should.equal("main")
		report.steps.map((s) => s.subject).should.deepEqual(["Добавил вторую строку", "Удалил b.txt"])
		const body = await runGit(dir, ["log", "-1", "--format=%B", report.steps[0].sha])
		body.should.containEql("Нужна для теста.")
		body.should.containEql("Skycode-Task: 1700000000001")
		;(await git.changedFiles()).map((f) => `${f.status} ${f.path}`).sort().should.deepEqual(["A src/new.cs", "D b.txt", "M a.txt"])
	})

	it("leaves the user's uncommitted edits out of step commits", async () => {
		write(dir, "b.txt", "user edit\n")
		const git = (await AgentGit.open(dir, "2", "t"))!
		await git.beginTurn()
		write(dir, "a.txt", "agent edit\n")
		const result = await git.commitStep("Правка агента")
		if (result.status !== "committed") throw new Error(result.status)
		result.commit.files.should.equal(1)
		result.carriedUserFiles.should.equal(1)
		;(await runGit(dir, ["status", "--porcelain"])).trim().should.equal("M b.txt")
	})

	it("does not commit anything when the turn start was not seen", async () => {
		write(dir, "b.txt", "user edit\n")
		const git = (await AgentGit.open(dir, "3", "t"))!
		;(await git.commitStep("x")).status.should.equal("no-changes")
		;(await branchOf(dir)).should.equal("main")
	})

	it("pauses commits when the user switched away from the task branch", async () => {
		const git = (await AgentGit.open(dir, "4", "t"))!
		await git.beginTurn()
		write(dir, "a.txt", "agent\n")
		await git.commitStep("one")
		await runGit(dir, ["checkout", "-q", "main"])
		await git.beginTurn()
		write(dir, "b.txt", "agent again\n")
		;(await git.commitStep("two")).status.should.equal("branch-not-current")
	})

	it("reverts one step and keeps the others", async () => {
		const git = (await AgentGit.open(dir, "5", "t"))!
		await git.beginTurn()
		write(dir, "a.txt", "step1\n")
		await git.commitStep("first")
		await git.beginTurn()
		write(dir, "b.txt", "step2\n")
		await git.commitStep("second")
		const before = (await git.report())!
		await git.revertStep(before.steps[0].sha)
		fs.readFileSync(path.join(dir, "a.txt"), "utf8").should.equal("one\n")
		fs.readFileSync(path.join(dir, "b.txt"), "utf8").should.equal("step2\n")
		const after = (await git.report())!
		after.steps.map((s) => s.reverted).should.deepEqual([true, false])
	})

	it("squash-merges into the base branch", async () => {
		const git = (await AgentGit.open(dir, "6", "t"))!
		await git.beginTurn()
		write(dir, "a.txt", "merged\n")
		await git.commitStep("change")
		await git.merge(true, "Задача: поменять a.txt")
		;(await branchOf(dir)).should.equal("main")
		;(await runGit(dir, ["log", "-1", "--format=%s"])).trim().should.equal("Задача: поменять a.txt")
		fs.readFileSync(path.join(dir, "a.txt"), "utf8").should.equal("merged\n")
		await git.deleteBranch()
		;(await runGit(dir, ["branch", "--list", "skycode/*"])).trim().should.equal("")
	})

	it("restores state when the merge conflicts", async () => {
		const git = (await AgentGit.open(dir, "7", "t"))!
		await git.beginTurn()
		write(dir, "a.txt", "agent\n")
		await git.commitStep("agent change")
		const branch = git.getState()!.branch
		await runGit(dir, ["checkout", "-q", "main"])
		write(dir, "a.txt", "main\n")
		await runGit(dir, ["commit", "-qam", "conflicting"])
		await runGit(dir, ["checkout", "-q", branch])
		await git.merge(true, "m").should.be.rejectedWith(/Слить не получилось/)
		;(await branchOf(dir)).should.equal(branch)
		;(await runGit(dir, ["status", "--porcelain"])).trim().should.equal("")
	})
})
