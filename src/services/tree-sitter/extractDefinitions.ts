import * as path from "path"
import { extendCSharpQuery } from "@services/repo-map/RepoMap"
import { Logger } from "@/shared/services/Logger"
import { type LanguageParser, loadRequiredLanguageParsers } from "./languageParser"

// [SKYCODE] Определения файла с диапазонами строк (для read_symbol).
// Тот же разбор tree-sitter, что у list_code_definition_names, но с границами узлов.

export interface DefinitionRange {
	name: string
	kind: string
	/** 1-based, включительно */
	startLine: number
	endLine: number
}

export interface DefinitionsResult {
	supported: boolean
	defs: DefinitionRange[]
}

const SUPPORTED_EXTS = new Set(["js", "jsx", "ts", "tsx", "py", "rs", "go", "c", "h", "cpp", "hpp", "cs", "rb", "java", "php", "swift", "kt"])

const parserCache: LanguageParser = {}

export function isDefinitionLanguageSupported(filePath: string): boolean {
	return SUPPORTED_EXTS.has(path.extname(filePath).slice(1).toLowerCase())
}

interface CaptureNode {
	name: string
	node: {
		text: string
		startPosition: { row: number }
		endPosition: { row: number }
		parent?: { startPosition: { row: number }; endPosition: { row: number } } | null
	}
}

/** Из захватов запроса собирает определения: `definition.<kind>` даёт границы, `name.definition.<kind>` — имя. */
export function definitionsFromCaptures(captures: CaptureNode[]): DefinitionRange[] {
	const names = captures.filter((c) => c.name.startsWith("name.definition."))
	const bodies = captures.filter((c) => c.name.startsWith("definition."))
	const used = new Set<CaptureNode>()
	const result: DefinitionRange[] = []
	const seen = new Set<string>()
	const push = (name: string, kind: string, start: number, end: number) => {
		const key = `${kind}:${name}:${start}:${end}`
		if (!seen.has(key)) {
			seen.add(key)
			result.push({ name, kind, startLine: start + 1, endLine: end + 1 })
		}
	}
	for (const body of bodies) {
		const kind = body.name.slice("definition.".length)
		const start = body.node.startPosition.row
		const end = body.node.endPosition.row
		let best: CaptureNode | undefined
		for (const n of names) {
			if (n.name !== `name.definition.${kind}` || used.has(n)) {
				continue
			}
			const row = n.node.startPosition.row
			if (row < start || row > end) {
				continue
			}
			if (!best || row < best.node.startPosition.row) {
				best = n
			}
		}
		if (best) {
			used.add(best)
			push(best.node.text, kind, start, end)
		}
	}
	// Имена без отдельного захвата тела: берём родительский узел
	for (const n of names) {
		if (used.has(n)) {
			continue
		}
		const kind = n.name.slice("name.definition.".length)
		const p = n.node.parent
		push(n.node.text, kind, p ? p.startPosition.row : n.node.startPosition.row, p ? p.endPosition.row : n.node.endPosition.row)
	}
	return result.sort((a, b) => a.startLine - b.startLine)
}

export async function extractDefinitionRanges(filePath: string, content: string): Promise<DefinitionsResult> {
	const ext = path.extname(filePath).slice(1).toLowerCase()
	if (!SUPPORTED_EXTS.has(ext)) {
		return { supported: false, defs: [] }
	}
	try {
		if (!parserCache[ext]) {
			const loaded = await loadRequiredLanguageParsers([filePath])
			extendCSharpQuery(loaded)
			Object.assign(parserCache, loaded)
		}
		const lang = parserCache[ext] as LanguageParser[string] & { extraQuery?: { captures(n: unknown): unknown[] } }
		const tree = lang.parser.parse(content)
		if (!tree?.rootNode) {
			return { supported: true, defs: [] }
		}
		const captures = [...lang.query.captures(tree.rootNode), ...(lang.extraQuery?.captures(tree.rootNode) ?? [])]
		const defs = definitionsFromCaptures(captures as unknown as CaptureNode[])
		tree.delete?.()
		return { supported: true, defs }
	} catch (error) {
		Logger.warn("[read_symbol] tree-sitter failed:", error)
		return { supported: false, defs: [] }
	}
}
