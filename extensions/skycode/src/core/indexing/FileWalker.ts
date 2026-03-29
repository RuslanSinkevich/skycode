/**
 * FileWalker — recursively walks workspace directories,
 * respecting .gitignore and user-configured ignore patterns.
 */
import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import type { IndexingConfig } from "@shared/IndexingTypes"

/** A file discovered during the walk */
export interface WalkedFile {
	/** Absolute path to the file */
	absPath: string
	/** Path relative to the workspace root */
	relPath: string
	/** File size in bytes */
	size: number
}

/** Binary/media extensions that should always be skipped */
const BINARY_EXTENSIONS = new Set([
	".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg", ".webp",
	".mp3", ".mp4", ".avi", ".mov", ".mkv", ".flac", ".wav", ".ogg",
	".zip", ".tar", ".gz", ".bz2", ".7z", ".rar", ".xz",
	".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
	".exe", ".dll", ".so", ".dylib", ".bin", ".obj", ".o",
	".woff", ".woff2", ".ttf", ".eot", ".otf",
	".sqlite", ".db", ".sqlite3",
	".pyc", ".pyo", ".class",
	".DS_Store", ".wasm",
])

/**
 * Check if a filename matches a glob-like pattern (simplified).
 * Supports:
 *  - exact match: "node_modules"
 *  - wildcard extension: "*.min.js"
 *  - directory match: ".git"
 */
function matchesPattern(name: string, relPath: string, pattern: string): boolean {
	// Wildcard pattern like *.min.js
	if (pattern.startsWith("*.")) {
		return name.endsWith(pattern.slice(1))
	}
	// Exact name match (directory or file)
	if (name === pattern) {
		return true
	}
	// Check if any segment of the relative path matches
	const segments = relPath.split(/[/\\]/)
	return segments.some((seg) => seg === pattern)
}

/**
 * Walk a directory tree and yield files that should be indexed.
 *
 * @param rootDir - Workspace root directory (absolute path)
 * @param config  - Indexing configuration with ignore patterns and max file size
 * @param token   - Cancellation token to abort the walk
 */
export async function* walkFiles(
	rootDir: string,
	config: IndexingConfig,
	token?: vscode.CancellationToken,
): AsyncGenerator<WalkedFile> {
	const stack: string[] = [rootDir]

	while (stack.length > 0) {
		if (token?.isCancellationRequested) {
			return
		}

		const dir = stack.pop()!
		let entries: fs.Dirent[]
		try {
			entries = await fs.promises.readdir(dir, { withFileTypes: true })
		} catch {
			// Permission denied or deleted directory — skip
			continue
		}

		for (const entry of entries) {
			if (token?.isCancellationRequested) {
				return
			}

			const absPath = path.join(dir, entry.name)
			const relPath = path.relative(rootDir, absPath)

			// Check ignore patterns
			const shouldIgnore = config.ignoredPatterns.some((pattern) =>
				matchesPattern(entry.name, relPath, pattern),
			)
			if (shouldIgnore) {
				continue
			}

			if (entry.isDirectory()) {
				stack.push(absPath)
			} else if (entry.isFile()) {
				// Skip binary files
				const ext = path.extname(entry.name).toLowerCase()
				if (BINARY_EXTENSIONS.has(ext)) {
					continue
				}

				// Check file size
				try {
					const stat = await fs.promises.stat(absPath)
					if (stat.size > config.maxFileSize) {
						// Log skipped large files so the user can diagnose missing search results
						console.log(`[Skycode Indexing] Skipped large file (${(stat.size / 1024).toFixed(0)}KB > ${(config.maxFileSize / 1024).toFixed(0)}KB): ${relPath}`)
						continue
					}
					if (stat.size === 0) {
						continue
					}

					yield { absPath, relPath, size: stat.size }
				} catch {
					// File may have been deleted between readdir and stat
					continue
				}
			}
		}
	}
}

/**
 * Count total files that would be walked (for progress reporting).
 */
export async function countFiles(
	rootDir: string,
	config: IndexingConfig,
	token?: vscode.CancellationToken,
): Promise<number> {
	let count = 0
	for await (const _ of walkFiles(rootDir, config, token)) {
		count++
	}
	return count
}
