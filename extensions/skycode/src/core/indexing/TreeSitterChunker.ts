/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from "node:path"
import type { CodeChunk } from "@shared/IndexingTypes"
import { v4 as uuidv4 } from "uuid"

const MAX_CHUNK_LINES = 45
const MIN_CHUNK_LINES = 3
const OVERLAP_LINES = 5

const EXTENSION_TO_TREESITTER: Record<string, string> = {
	".ts": "typescript",
	".tsx": "tsx",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".py": "python",
	".rs": "rust",
	".go": "go",
	".java": "java",
	".kt": "kotlin",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".hpp": "cpp",
	".cc": "cpp",
	".cs": "c_sharp",
	".rb": "ruby",
	".php": "php",
	".swift": "swift",
}

const CHUNK_NODE_TYPES = new Set([
	"function_declaration",
	"function_definition",
	"method_definition",
	"method_declaration",
	"function_item",
	"class_declaration",
	"class_definition",
	"struct_item",
	"impl_item",
	"interface_declaration",
	"type_alias_declaration",
	"enum_declaration",
	"enum_item",
	"module",
	"module_item",
	"export_statement",
	"decorated_definition",
])

let parserInstance: any | null = null
const languageCache = new Map<string, any | null>()

function splitLargeBlock(lines: string[], startLine: number, filePath: string, language: string): CodeChunk[] {
	const chunks: CodeChunk[] = []
	let i = 0

	while (i < lines.length) {
		const end = Math.min(i + MAX_CHUNK_LINES, lines.length)
		const chunkLines = lines.slice(i, end)
		if (chunkLines.length >= MIN_CHUNK_LINES) {
			chunks.push({
				id: uuidv4(),
				filePath,
				content: chunkLines.join("\n"),
				startLine: startLine + i,
				endLine: startLine + end - 1,
				language,
			})
		}
		i += MAX_CHUNK_LINES - OVERLAP_LINES
		if (i >= lines.length) {
			break
		}
	}

	return chunks
}

async function initParser(): Promise<void> {
	if (parserInstance) {
		return
	}
	const TreeSitter = await import("web-tree-sitter")
	const Parser = TreeSitter.default ?? TreeSitter
	await Parser.init()
	parserInstance = new Parser()
}

async function loadLanguage(langName: string, wasmDir: string): Promise<any | null> {
	if (languageCache.has(langName)) {
		return languageCache.get(langName) ?? null
	}

	try {
		const wasmPath = path.join(wasmDir, `tree-sitter-${langName}.wasm`)
		const TreeSitter = await import("web-tree-sitter")
		const Parser = TreeSitter.default ?? TreeSitter
		const language = await Parser.Language.load(wasmPath)
		languageCache.set(langName, language)
		return language
	} catch {
		languageCache.set(langName, null)
		return null
	}
}

export async function chunkFileTreeSitter(
	filePath: string,
	contents: string,
	wasmDir: string,
): Promise<CodeChunk[] | null> {
	const ext = path.extname(filePath).toLowerCase()
	const langName = EXTENSION_TO_TREESITTER[ext]
	if (!langName || !wasmDir) {
		return null
	}

	await initParser()
	const language = await loadLanguage(langName, wasmDir)
	if (!language || !parserInstance) {
		return null
	}

	parserInstance.setLanguage(language)
	const tree = parserInstance.parse(contents)
	const rootNode = tree.rootNode
	const allLines = contents.split("\n")
	const chunks: CodeChunk[] = []
	let pendingLines: string[] = []
	let pendingStart = 0

	const pushChunkFromLines = (lines: string[], startLine: number): void => {
		if (lines.length < MIN_CHUNK_LINES) {
			return
		}
		if (lines.length <= MAX_CHUNK_LINES) {
			chunks.push({
				id: uuidv4(),
				filePath,
				content: lines.join("\n"),
				startLine,
				endLine: startLine + lines.length - 1,
				language: langName,
			})
		} else {
			chunks.push(...splitLargeBlock(lines, startLine, filePath, langName))
		}
	}

	const flushPending = (): void => {
		if (pendingLines.length === 0) {
			return
		}
		pushChunkFromLines(pendingLines, pendingStart)
		pendingLines = []
	}

	for (let i = 0; i < rootNode.childCount; i++) {
		const node = rootNode.child(i)
		if (!node) {
			continue
		}

		const nodeStartLine = node.startPosition.row
		const nodeEndLine = node.endPosition.row
		const nodeLines = allLines.slice(nodeStartLine, nodeEndLine + 1)
		const isStructuredNode = CHUNK_NODE_TYPES.has(node.type)

		if (isStructuredNode) {
			flushPending()
			pushChunkFromLines(nodeLines, nodeStartLine)
		} else {
			if (pendingLines.length === 0) {
				pendingStart = nodeStartLine
			}
			pendingLines.push(...nodeLines)
			if (pendingLines.length >= MAX_CHUNK_LINES) {
				flushPending()
			}
		}
	}

	flushPending()

	if (chunks.length === 0 && allLines.length > 0) {
		pushChunkFromLines(allLines, 0)
	}

	return chunks.length > 0 ? chunks : null
}
