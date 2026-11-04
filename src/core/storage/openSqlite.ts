/**
 * [SKYCODE] SQLite через встроенный `node:sqlite` вместо нативного better-sqlite3.
 *
 * better-sqlite3 — нативный модуль: под каждую версию Electron нужен свой
 * бинарник. Для Electron форка (42) готового не было, и индекс молча уходил
 * в медленное JSON-хранилище, а блокировки не открывались вовсе. `node:sqlite`
 * встроен в Node ≥ 22.5 (в Electron форка — Node 24), ничего собирать не нужно.
 *
 * Обёртка повторяет ту часть API better-sqlite3, которой пользуются
 * IndexStorage: exec / prepare / pragma / transaction / close.
 */

/** Значение параметра / колонки. BLOB приходит как Uint8Array. */
export type SqliteValue = null | number | bigint | string | Uint8Array

export interface SqliteRunResult {
	changes: number | bigint
	lastInsertRowid: number | bigint
}

export interface SqliteStatement {
	run(...params: SqliteValue[]): SqliteRunResult
	get(...params: SqliteValue[]): any
	all(...params: SqliteValue[]): any[]
}

export interface SqliteDb {
	exec(sql: string): void
	prepare(sql: string): SqliteStatement
	/** `pragma("journal_mode = WAL")` → `PRAGMA journal_mode = WAL`. */
	pragma(setting: string): void
	/**
	 * Как в better-sqlite3: возвращает функцию, выполняющую `fn` в транзакции.
	 * Вложенные вызовы оборачиваются в SAVEPOINT.
	 */
	transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R
	close(): void
}

interface NodeSqliteModule {
	DatabaseSync: new (
		path: string,
	) => {
		exec(sql: string): void
		prepare(sql: string): SqliteStatement
		close(): void
	}
}

/**
 * node:sqlite передаёт любое JS-число как REAL: `'%:' || 1234` даёт `'%:1234.0'`,
 * Date.now() пишется дробным. better-sqlite3 передавал целые как INTEGER — так и
 * делаем: целое число → BigInt (читаются INTEGER-колонки всё равно как number).
 */
function toParam(value: SqliteValue): SqliteValue {
	return typeof value === "number" && Number.isSafeInteger(value) ? BigInt(value) : value
}

function wrapStatement(statement: SqliteStatement): SqliteStatement {
	return {
		run: (...params) => statement.run(...params.map(toParam)),
		get: (...params) => statement.get(...params.map(toParam)),
		all: (...params) => statement.all(...params.map(toParam)),
	}
}

export function openSqlite(dbPath: string): SqliteDb {
	// require в рантайме: в @types/node 20 нет типов node:sqlite, а esbuild
	// (platform: node) оставляет встроенные node:* модули внешними.
	const { DatabaseSync } = require("node:sqlite") as NodeSqliteModule
	const db = new DatabaseSync(dbPath)
	let depth = 0

	return {
		exec: (sql) => db.exec(sql),
		prepare: (sql) => wrapStatement(db.prepare(sql)),
		pragma: (setting) => db.exec(`PRAGMA ${setting}`),
		transaction:
			<A extends unknown[], R>(fn: (...args: A) => R) =>
			(...args: A): R => {
				const savepoint = `sp_${depth}`
				db.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`)
				depth++
				try {
					const result = fn(...args)
					depth--
					db.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
					return result
				} catch (error) {
					depth--
					db.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`)
					throw error
				}
			},
		close: () => db.close(),
	}
}
