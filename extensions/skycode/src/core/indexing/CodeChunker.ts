/**
 * CodeChunker — splits source files into meaningful chunks for embedding.
 *
 * Strategy:
 * 1. Split by blank-line-separated blocks (functions, classes, etc.)
 * 2. If a block is too large, split it by lines with overlap
 * 3. Each chunk keeps track of its start/end line numbers
 *
 * This is a simplified chunker that doesn't require tree-sitter.
 * It works well for most programming languages.
 */
import * as path from "node:path"
import type { CodeChunk } from "@shared/IndexingTypes"
import { v4 as uuidv4 } from "uuid"
import { chunkFileTreeSitter } from "./TreeSitterChunker"

/** Maximum number of lines per chunk */
const MAX_CHUNK_LINES = 35

/** Minimum number of lines for a chunk to be meaningful */
const MIN_CHUNK_LINES = 3

/** Overlap lines between adjacent chunks when splitting large blocks */
const OVERLAP_LINES = 5
let treeSitterWasmDir = ""

/** Map file extensions to language names */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".mjs": "javascript",
	".cjs": "javascript",
	".py": "python",
	".rs": "rust",
	".go": "go",
	".java": "java",
	".kt": "kotlin",
	".kts": "kotlin",
	".c": "c",
	".h": "c",
	".cpp": "cpp",
	".hpp": "cpp",
	".cc": "cpp",
	".cs": "csharp",
	".rb": "ruby",
	".php": "php",
	".swift": "swift",
	".scala": "scala",
	".r": "r",
	".R": "r",
	".lua": "lua",
	".sh": "shell",
	".bash": "shell",
	".zsh": "shell",
	".fish": "shell",
	".ps1": "powershell",
	".sql": "sql",
	".md": "markdown",
	".mdx": "markdown",
	".yaml": "yaml",
	".yml": "yaml",
	".toml": "toml",
	".json": "json",
	".xml": "xml",
	".html": "html",
	".htm": "html",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".vue": "vue",
	".svelte": "svelte",
	".dart": "dart",
	".ex": "elixir",
	".exs": "elixir",
	".erl": "erlang",
	".hs": "haskell",
	".ml": "ocaml",
	".fs": "fsharp",
	".clj": "clojure",
	".tf": "terraform",
	".proto": "protobuf",
	".graphql": "graphql",
	".gql": "graphql",
}

function detectLanguage(filePath: string): string {
	const ext = path.extname(filePath).toLowerCase()
	return EXTENSION_TO_LANGUAGE[ext] || "text"
}

/**
 * Check if a line is a "boundary" line that typically separates code blocks.
 * Empty lines and lines that start top-level definitions.
 */
function isBoundaryLine(line: string): boolean {
	const trimmed = line.trimEnd()
	if (trimmed === "") return true
	// Top-level construct starts (no indentation)
	if (/^(export\s+)?(function|class|interface|type|enum|const|let|var|def|fn|pub|impl|struct|trait|mod|package|import)\s/.test(trimmed)) {
		return true
	}
	return false
}

/**
 * Split a block of lines into chunks respecting MAX_CHUNK_LINES.
 * Uses overlap for continuity.
 */
function splitLargeBlock(
	lines: string[],
	startLine: number,
	filePath: string,
	language: string,
): CodeChunk[] {
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
		if (i >= lines.length) break
	}
	return chunks
}

/**
 * Chunk a file's contents into meaningful code chunks.
 *
 * @param filePath - Relative path to the file
 * @param contents - File contents as a string
 * @returns Array of code chunks
 */
function chunkFileSimple(filePath: string, contents: string): CodeChunk[] {
	const language = detectLanguage(filePath)
	const allLines = contents.split("\n")
	const chunks: CodeChunk[] = []

	// Accumulate lines into blocks separated by boundaries
	let blockStart = 0
	let blockLines: string[] = []

	for (let i = 0; i < allLines.length; i++) {
		const line = allLines[i]

		if (isBoundaryLine(line) && blockLines.length > 0) {
			// We found a boundary — flush the current block
			if (blockLines.length >= MIN_CHUNK_LINES) {
				if (blockLines.length <= MAX_CHUNK_LINES) {
					chunks.push({
						id: uuidv4(),
						filePath,
						content: blockLines.join("\n"),
						startLine: blockStart,
						endLine: blockStart + blockLines.length - 1,
						language,
					})
				} else {
					chunks.push(...splitLargeBlock(blockLines, blockStart, filePath, language))
				}
			}
			blockLines = []
			blockStart = i
		}

		blockLines.push(line)
	}

	// Flush remaining block
	if (blockLines.length >= MIN_CHUNK_LINES) {
		if (blockLines.length <= MAX_CHUNK_LINES) {
			chunks.push({
				id: uuidv4(),
				filePath,
				content: blockLines.join("\n"),
				startLine: blockStart,
				endLine: blockStart + blockLines.length - 1,
				language,
			})
		} else {
			chunks.push(...splitLargeBlock(blockLines, blockStart, filePath, language))
		}
	}

	// If file produced zero chunks (very short file), make one chunk from entire file
	if (chunks.length === 0 && allLines.length > 0) {
		chunks.push({
			id: uuidv4(),
			filePath,
			content: contents,
			startLine: 0,
			endLine: allLines.length - 1,
			language,
		})
	}

	return chunks
}

export function setTreeSitterWasmDir(dir: string): void {
	treeSitterWasmDir = dir
}

export async function chunkFile(filePath: string, contents: string): Promise<CodeChunk[]> {
	if (treeSitterWasmDir) {
		try {
			const treeSitterChunks = await chunkFileTreeSitter(filePath, contents, treeSitterWasmDir)
			if (treeSitterChunks && treeSitterChunks.length > 0) {
				return treeSitterChunks
			}
		} catch {
			// Fallback to simple chunker.
		}
	}

	return chunkFileSimple(filePath, contents)
}
