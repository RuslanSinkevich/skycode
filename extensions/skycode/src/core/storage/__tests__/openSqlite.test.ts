// [SKYCODE] SQLite через встроенный node:sqlite (вместо нативного better-sqlite3).
import "should"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { IndexStorage } from "@/core/indexing/storage/IndexStorage"
import { SqliteLockManager } from "@/core/locks/SqliteLockManager"
import { openSqlite } from "../openSqlite"

describe("openSqlite (node:sqlite)", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "skycode-sqlite-"))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("prepare / run / get / all и pragma", () => {
		const db = openSqlite(path.join(dir, "a.db"))
		db.pragma("journal_mode = WAL")
		db.exec("CREATE TABLE t (k TEXT PRIMARY KEY, v INTEGER)")
		const res = db.prepare("INSERT INTO t VALUES (?, ?)").run("a", 1)
		Number(res.changes).should.equal(1)
		db.prepare("INSERT INTO t VALUES (?, ?)").run("b", 2)
		db.prepare("SELECT v FROM t WHERE k = ?").get("b").v.should.equal(2)
		db.prepare("SELECT k FROM t ORDER BY k")
			.all()
			.map((r) => r.k)
			.should.deepEqual(["a", "b"])
		db.close()
	})

	it("transaction коммитит, а при ошибке откатывает", () => {
		const db = openSqlite(path.join(dir, "b.db"))
		db.exec("CREATE TABLE t (v INTEGER)")
		const insert = db.prepare("INSERT INTO t VALUES (?)")
		db.transaction((n: number) => insert.run(n))(1)
		;(() =>
			db.transaction(() => {
				insert.run(2)
				throw new Error("boom")
			})()).should.throw("boom")
		db.prepare("SELECT count(*) AS c FROM t").get().c.should.equal(1)
		db.close()
	})

	it("вложенная transaction откатывается до savepoint, внешняя коммитится", () => {
		const db = openSqlite(path.join(dir, "c.db"))
		db.exec("CREATE TABLE t (v INTEGER)")
		const insert = db.prepare("INSERT INTO t VALUES (?)")
		db.transaction(() => {
			insert.run(1)
			try {
				db.transaction(() => {
					insert.run(2)
					throw new Error("inner")
				})()
			} catch {
				// внутренняя откатилась
			}
			insert.run(3)
		})()
		db.prepare("SELECT v FROM t ORDER BY v")
			.all()
			.map((r) => r.v)
			.should.deepEqual([1, 3])
		db.close()
	})

	it("целые числа передаются как INTEGER (как в better-sqlite3), дробные — как REAL", () => {
		const db = openSqlite(path.join(dir, "e.db"))
		const row = db.prepare("SELECT typeof(?) AS i, '%:' || ? AS s, typeof(?) AS r").get(1234, 1234, 0.5)
		row.i.should.equal("integer")
		row.s.should.equal("%:1234")
		row.r.should.equal("real")
		db.close()
	})

	it("BLOB возвращается байт в байт", () => {
		const db = openSqlite(path.join(dir, "d.db"))
		db.exec("CREATE TABLE t (b BLOB)")
		const vec = new Float32Array([0.5, -1.25, 3])
		db.prepare("INSERT INTO t VALUES (?)").run(Buffer.from(vec.buffer))
		const blob: Uint8Array = db.prepare("SELECT b FROM t").get().b
		Array.from(new Float32Array(blob.slice().buffer)).should.deepEqual([0.5, -1.25, 3])
		db.close()
	})
})

describe("IndexStorage на node:sqlite", () => {
	let home: string
	const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE }

	// os.homedir нельзя подменить через sinon — он читает HOME / USERPROFILE.
	beforeEach(() => {
		home = fs.mkdtempSync(path.join(os.tmpdir(), "skycode-index-"))
		process.env.HOME = home
		process.env.USERPROFILE = home
	})

	afterEach(() => {
		process.env.HOME = savedEnv.HOME
		process.env.USERPROFILE = savedEnv.USERPROFILE
		fs.rmSync(home, { recursive: true, force: true })
	})

	it("сохраняет чанки и векторы в SQLite и читает их обратно", async () => {
		const storage = new IndexStorage("/work/project")
		storage.beginIndexing("test-model", 3)
		storage.addChunks(
			[
				{
					id: "c1",
					filePath: "a.ts",
					content: "x",
					startLine: 1,
					endLine: 2,
					language: "ts",
					fileHash: "h1",
					vectorOffset: 0,
				},
				{
					id: "c2",
					filePath: "b.ts",
					content: "y",
					startLine: 3,
					endLine: 4,
					language: "ts",
					fileHash: "h2",
					vectorOffset: 0,
				},
			],
			[
				[0.1, 0.2, 0.3],
				[1, 2, 3],
			],
		)
		storage.setMetadata("k", "v")
		await storage.finalize()
		// Публичного close() у IndexStorage нет; закрываем базу, чтобы Windows дал удалить временную папку.
		;(storage as unknown as { db: { close(): void } }).db.close()

		const reloaded = new IndexStorage("/work/project")
		;(await reloaded.load()).should.be.true()
		reloaded
			.getChunks()
			.map((c) => c.id)
			.should.deepEqual(["c1", "c2"])
		Array.from(reloaded.getVector(reloaded.getChunks()[1].vectorOffset)).should.deepEqual([1, 2, 3])
		reloaded.getMetadata("k")!.should.equal("v")
		reloaded.isFileChanged("a.ts", "h1").should.be.false()
		await reloaded.clear()
	})
})

describe("SqliteLockManager на node:sqlite", () => {
	let dir: string

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), "skycode-locks-"))
	})

	afterEach(() => {
		fs.rmSync(dir, { recursive: true, force: true })
	})

	it("регистрирует инстанс и захватывает / отпускает папку", async () => {
		const locks = new SqliteLockManager({ dbPath: path.join(dir, "locks.db"), instanceAddress: "127.0.0.1:1234" })
		try {
			await locks.registerInstance({ hostAddress: "127.0.0.1:5678" })
			// Поиск по порту: `LIKE '%:' || ?` — с REAL-параметром вышло бы '%:1234.0'.
			locks.getInstanceByPort(1234)!.hostAddress.should.equal("127.0.0.1:5678")
			;((await locks.registerFolderLock("task", "/repo")) === null).should.be.true()
			// Повторный захват той же папки этим же инстансом — не конфликт.
			;((await locks.registerFolderLock("task", "/repo")) === null).should.be.true()
			locks.releaseFolderLockByTarget("task", "/repo")
			;((await locks.getFolderLockByTarget("/repo")) === null).should.be.true()
		} finally {
			locks.close()
		}
	})
})
