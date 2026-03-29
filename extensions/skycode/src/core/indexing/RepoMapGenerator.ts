import * as fs from "node:fs/promises"
import * as path from "node:path"

/**
 * RepoMapGenerator — creates a compact "table of contents" of the project.
 * Extracts exported symbols (functions, classes, interfaces) from source files
 * using simple regex (no tree-sitter dependency for speed).
 *
 * Used in system prompt to give the AI a quick overview of the project.
 */

interface FileSignature {
	relativePath: string
	symbols: string[]
}

// Patterns to extract exported symbols (multi-language)
const EXPORT_PATTERNS: RegExp[] = [
	// TypeScript / JavaScript
	/^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm,
	/^export\s+(?:default\s+)?class\s+(\w+)/gm,
	/^export\s+(?:default\s+)?interface\s+(\w+)/gm,
	/^export\s+(?:default\s+)?type\s+(\w+)/gm,
	/^export\s+(?:default\s+)?enum\s+(\w+)/gm,
	/^export\s+(?:default\s+)?const\s+(\w+)/gm,
	// Python
	/^def\s+(\w+)\s*\(/gm,
	/^class\s+(\w+)/gm,
	// Rust
	/^pub\s+(?:async\s+)?fn\s+(\w+)/gm,
	/^pub\s+struct\s+(\w+)/gm,
	/^pub\s+enum\s+(\w+)/gm,
	/^pub\s+trait\s+(\w+)/gm,
	// Go
	/^func\s+(\w+)/gm,
	/^type\s+(\w+)\s+struct/gm,
	/^type\s+(\w+)\s+interface/gm,
]

const SOURCE_EXTENSIONS = new Set([
	".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go",
	".java", ".kt", ".cs", ".cpp", ".c", ".h", ".hpp",
	".rb", ".php", ".swift", ".scala",
])

const IGNORE_DIRS = new Set([
	"node_modules", ".git", "dist", "build", "out", ".next",
	"__pycache__", ".venv", "venv", "coverage", ".cache",
	"vendor", "target",
])

const MAX_FILE_SIZE = 100 * 1024 // 100KB
const MAX_FILES = 500
const MAX_SYMBOLS_PER_FILE = 20

export class RepoMapGenerator {
	private cache: string | null = null
	private cacheTimestamp: number = 0
	private readonly CACHE_TTL = 30_000 // 30 seconds

	constructor(private readonly rootDir: string) {}

	/**
	 * Generate (or return cached) repo map.
	 * @param maxChars Max characters in the output (default 6000 ≈ 2000 tokens)
	 */
	async generate(maxChars: number = 6000): Promise<string> {
		const now = Date.now()
		if (this.cache && now - this.cacheTimestamp < this.CACHE_TTL) {
			return this.cache
		}

		try {
			const signatures = await this.collectSignatures()
			const map = this.formatMap(signatures, maxChars)
			this.cache = map
			this.cacheTimestamp = now
			return map
		} catch {
			// If anything goes wrong, return empty (non-critical feature)
			return ""
		}
	}

	/** Invalidate cache (call on file changes) */
	invalidate(): void {
		this.cache = null
	}

	private async collectSignatures(): Promise<FileSignature[]> {
		const results: FileSignature[] = []
		await this.walkDir(this.rootDir, "", results)
		// Sort: files with more symbols first (more important)
		results.sort((a, b) => b.symbols.length - a.symbols.length)
		return results.slice(0, MAX_FILES)
	}

	private async walkDir(
		dir: string,
		relativeTo: string,
		results: FileSignature[],
	): Promise<void> {
		if (results.length >= MAX_FILES) {
			return
		}

		let entries
		try {
			entries = await fs.readdir(dir, { withFileTypes: true })
		} catch {
			return
		}

		for (const entry of entries) {
			if (results.length >= MAX_FILES) {
				break
			}

			const fullPath = path.join(dir, entry.name)
			const relPath = relativeTo ? `${relativeTo}/${entry.name}` : entry.name

			if (entry.isDirectory()) {
				if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
					await this.walkDir(fullPath, relPath, results)
				}
			} else if (entry.isFile()) {
				const ext = path.extname(entry.name).toLowerCase()
				if (!SOURCE_EXTENSIONS.has(ext)) {
					continue
				}

				try {
					const stat = await fs.stat(fullPath)
					if (stat.size > MAX_FILE_SIZE || stat.size === 0) {
						continue
					}

					const content = await fs.readFile(fullPath, "utf-8")
					const symbols = this.extractSymbols(content)

					if (symbols.length > 0) {
						results.push({
							relativePath: relPath,
							symbols: symbols.slice(0, MAX_SYMBOLS_PER_FILE),
						})
					}
					// Files without symbols are skipped to keep the map compact
				} catch {
					// Skip files that can't be read
				}
			}
		}
	}

	private extractSymbols(content: string): string[] {
		const symbols = new Set<string>()

		for (const pattern of EXPORT_PATTERNS) {
			// Reset regex state (global flag persists lastIndex)
			pattern.lastIndex = 0
			let match
			while ((match = pattern.exec(content)) !== null) {
				if (match[1] && match[1].length > 1) {
					symbols.add(match[1])
				}
			}
		}

		return Array.from(symbols)
	}

	private formatMap(signatures: FileSignature[], maxChars: number): string {
		if (signatures.length === 0) {
			return ""
		}

		const lines: string[] = []
		let totalChars = 0

		for (const sig of signatures) {
			const line = `${sig.relativePath}: ${sig.symbols.join(", ")}`

			if (totalChars + line.length + 1 > maxChars) {
				break
			}
			lines.push(line)
			totalChars += line.length + 1
		}

		return lines.join("\n")
	}
}
