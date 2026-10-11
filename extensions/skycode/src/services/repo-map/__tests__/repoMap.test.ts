// [SKYCODE] Карта репозитория: ранжирование, поиск по символам, извлечение SQL, текстовый поиск.
import "should"
import { extractSqlSymbols, symbolsFromCaptures } from "../extractSymbols"
import { bareName, queryTerms, type RepoFileEntry, RepoMapIndex, type RepoSymbol, splitIdentifier } from "../RepoMapIndex"
import { rankTextMatches, textSearchPattern, textSearchStem, textSearchStems } from "../searchWithoutIndex"

function sym(name: string, kind = "class", line = 1, signature?: string): RepoSymbol {
	return { name, kind, line, signature: signature ?? `class ${name}` }
}

function entry(symbols: RepoSymbol[], refs: string[] = []): RepoFileEntry {
	return { mtimeMs: 0, size: 0, symbols, refs }
}

describe("RepoMapIndex", () => {
	it("splits identifiers in all casings", () => {
		splitIdentifier("getUserById").should.deepEqual(["get", "user", "by", "id"])
		splitIdentifier("get_user_by_id").should.deepEqual(["get", "user", "by", "id"])
		splitIdentifier("HTTPServerError").should.deepEqual(["http", "server", "error"])
	})

	it("drops stop words and short tokens from queries", () => {
		queryTerms("where is the UserService").should.deepEqual(["userservice", "user", "service"])
	})

	it("strips schema and brackets from names", () => {
		bareName("[dbo].[spFindPact]").should.equal("spFindPact")
		bareName("dbo.spFindPact").should.equal("spFindPact")
	})

	it("computes refs to other files' symbols only", () => {
		const refs = RepoMapIndex.computeRefs(
			"class A { b: UserService; own: OwnThing; }",
			[sym("OwnThing")],
			new Set(["UserService", "OwnThing", "Missing"]),
		)
		refs.should.deepEqual(["UserService"])
	})

	it("ranks widely referenced files first in the overview", () => {
		const index = new RepoMapIndex()
		index.files.set("core/UserService.ts", entry([sym("UserService")]))
		index.files.set("misc/Helper.ts", entry([sym("Helper")]))
		for (let i = 0; i < 5; i++) {
			index.files.set(`feature${i}.ts`, entry([], ["UserService"]))
		}
		index.files.set("other.ts", entry([], ["Helper"]))
		index.rerank()
		const overview = index.renderOverview()
		overview.indexOf("core/UserService.ts").should.be.lessThan(overview.indexOf("misc/Helper.ts"))
	})

	it("hides names declared in many files and duplicate overloads in the overview", () => {
		const index = new RepoMapIndex()
		for (let i = 0; i < 5; i++) {
			index.files.set(`f${i}.cs`, entry([sym("App", "module", 1, "namespace App"), sym(`Form${i}`, "class", 3)]))
		}
		index.files.set(
			"Show.cs",
			entry([sym("Show", "method", 5, "void Show(int a)"), sym("Show", "method", 9, "void Show(string s)")]),
		)
		index.rerank()
		const overview = index.renderOverview()
		overview.should.not.containEql("namespace App")
		overview.should.containEql("class Form0")
		;(overview.match(/void Show/g) ?? []).length.should.equal(1)
	})

	it("finds symbols by name parts and prefers matching all words", () => {
		const index = new RepoMapIndex()
		index.files.set(
			"src/billing/InvoiceService.cs",
			entry([sym("InvoiceService"), sym("CalculateTotal", "method", 20, "public decimal CalculateTotal()")]),
		)
		index.files.set("src/users/UserService.cs", entry([sym("UserService")]))
		index.rerank()
		const hits = index.search("invoice service")
		hits[0].symbol.name.should.equal("InvoiceService")
		hits.map((h) => h.symbol.name).should.containEql("UserService")
	})

	it("weights rare words above common ones", () => {
		const index = new RepoMapIndex()
		const common = Array.from({ length: 30 }, (_, i) => sym(`update${i}`, "method", i + 1, `void update${i}()`))
		index.files.set("a.ts", entry(common))
		index.files.set("b.ts", entry([sym("SqliteStore")]))
		index.rerank()
		index.search("update sqlite")[0].symbol.name.should.equal("SqliteStore")
	})

	it("does not list every method of a file that matched only by path", () => {
		const index = new RepoMapIndex()
		index.files.set(
			"src/sqlite/Store.ts",
			entry([sym("Store", "class", 1), sym("open", "method", 5, "open()"), sym("close", "method", 9, "close()")]),
		)
		index.rerank()
		index
			.search("sqlite")
			.map((h) => h.symbol.name)
			.should.deepEqual(["Store"])
	})
})

describe("extractSqlSymbols", () => {
	it("finds procedures, functions, tables and views with their lines", () => {
		const sql = [
			"-- header",
			"CREATE OR ALTER PROCEDURE [dbo].[spFindPact]",
			"  @id int",
			"AS SELECT 1",
			"GO",
			"create table dbo.tPact (id int)",
			"ALTER FUNCTION dbo.fnSum(@a int) RETURNS int",
			"CREATE VIEW vPacts AS SELECT * FROM tPact",
			"CREATE TABLE IF NOT EXISTS users (id int)",
		].join("\r\n")
		const symbols = extractSqlSymbols(sql)
		symbols
			.map((s) => [s.kind, s.name, s.line])
			.should.deepEqual([
				["procedure", "dbo.spFindPact", 2],
				["table", "dbo.tPact", 6],
				["function", "dbo.fnSum", 7],
				["view", "vPacts", 8],
				["table", "users", 9],
			])
		symbols[0].signature.should.equal("CREATE OR ALTER PROCEDURE [dbo].[spFindPact]")
	})

	it("ignores references that are not definitions", () => {
		extractSqlSymbols("EXEC dbo.spFindPact 1\nSELECT * FROM tPact").should.deepEqual([])
	})
})

describe("symbolsFromCaptures", () => {
	it("keeps only name.definition captures, once per line and name", () => {
		const lines = ["class Foo {", "  bar() {}", "}"]
		const node = (text: string, row: number) => ({ text, startPosition: { row } })
		const symbols = symbolsFromCaptures(
			[
				{ name: "definition.class", node: node("class Foo {...}", 0) },
				{ name: "name.definition.class", node: node("Foo", 0) },
				{ name: "name.definition.method", node: node("bar", 1) },
				{ name: "name.definition.method", node: node("bar", 1) },
			],
			lines,
		)
		symbols.should.deepEqual([
			{ name: "Foo", kind: "class", line: 1, signature: "class Foo {" },
			{ name: "bar", kind: "method", line: 2, signature: "bar() {}" },
		])
	})
})

describe("text search without index", () => {
	it("stems long Russian words only", () => {
		textSearchStem("договора").should.equal("догово")
		textSearchStem("поиск").should.equal("поиск")
		textSearchStem("contracts").should.equal("contracts")
	})

	it("builds a case-insensitive alternation of escaped stems", () => {
		String(textSearchPattern("расчет графика платежей")).should.equal("(?i)(платеж|графи|расч)")
		;(textSearchPattern("a b") === null).should.be.true()
		String(textSearchPattern("c++ parser")).should.equal("(?i)(parser)")
	})

	it("ranks files by how many different query words they contain", () => {
		const stems = textSearchStems("график платежей")
		const out = rankTextMatches(
			[
				{ file: "many.cs", line: 1, text: "график" },
				{ file: "many.cs", line: 2, text: "график" },
				{ file: "many.cs", line: 3, text: "график" },
				{ file: "both.cs", line: 10, text: "// график платежей" },
			],
			stems,
		)
		out.indexOf("both.cs").should.be.lessThan(out.indexOf("many.cs"))
		out.should.containEql("both.cs (1 match)")
		out.should.containEql("  10: // график платежей")
	})
})
