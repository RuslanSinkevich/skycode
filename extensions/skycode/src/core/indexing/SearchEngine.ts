/**
 * SearchEngine — public API for semantic codebase search.
 *
 * Wraps IndexingService.search() and provides additional utilities
 * like formatting results for injection into AI prompts.
 */
import type { IndexSearchResult } from "@shared/IndexingTypes"
import * as vscode from "vscode"
import type { IndexingService } from "./IndexingService"
import { rerankResults } from "./Reranker"
import { filePathSearch, keywordSearch } from "./storage/KeywordSearch"

/**
 * Check if a query contains mostly non-Latin characters.
 * Used to adjust search weights: for non-Latin queries, semantic search
 * should dominate because keyword matching against Latin code identifiers
 * won't work for Cyrillic/CJK/Arabic/etc.
 *
 * This approach scales to any language without per-language dictionaries.
 */
function isNonLatinQuery(query: string): boolean {
	// Remove whitespace, digits, and common punctuation
	const cleaned = query.replace(/[\s\d\-_.,;:!?()[\]{}<>"/\\|@#$%^&*+=~`']+/g, "")
	if (cleaned.length === 0) return false

	// Count Latin characters (a-z, A-Z)
	let latinCount = 0
	for (const char of cleaned) {
		if (/[a-zA-Z]/.test(char)) {
			latinCount++
		}
	}

	// If less than 40% of meaningful characters are Latin -> non-Latin query
	return latinCount / cleaned.length < 0.4
}

/**
 * Detect queries that are mostly non-Latin, but still contain meaningful Latin
 * tokens (e.g. "autofaq", "grpc", "Task.presentAssistantMessage").
 * These queries often rely on exact identifier/path matches.
 */
function hasMeaningfulLatinTokens(query: string): boolean {
	const tokens = query
		.toLowerCase()
		.split(/[\s\-_.,;:!?()[\]{}<>"/\\|@#$%^&*+=~`']+/)
		.filter((t) => t.length >= 3)

	return tokens.some((token) => /[a-z]/.test(token))
}

/** Format a search result as a code snippet for AI context */
function formatResultForContext(result: IndexSearchResult): string {
	const header = `// File: ${result.filePath} (lines ${result.startLine + 1}-${result.endLine + 1}) [score: ${result.score.toFixed(3)}]`
	return `${header}\n${result.content}`
}

export class SearchEngine {
	constructor(private readonly indexingService: IndexingService) {}

	private isDebugSearchLogsEnabled(): boolean {
		return vscode.workspace.getConfiguration("skycode.indexing").get<boolean>("debug", false)
	}

	private logSearch(message: string, payload?: unknown): void {
		if (!this.isDebugSearchLogsEnabled()) {
			return
		}
		if (payload !== undefined) {
			console.log(message, payload)
			return
		}
		console.log(message)
	}

	/**
	 * Search the codebase index for chunks semantically similar to the query.
	 *
	 * @param query - Natural language query or code snippet
	 * @param topK  - Number of top results (default: 10)
	 * @returns Array of search results sorted by relevance
	 */
	async search(query: string, topK: number = 10): Promise<IndexSearchResult[]> {
		const candidateCount = Math.max(topK * 2, topK)

		const nonLatin = isNonLatinQuery(query)
		const mixedQuery = nonLatin && hasMeaningfulLatinTokens(query)

		this.logSearch(`[Skycode Search] Query: "${query}" | nonLatin: ${nonLatin}, mixed: ${mixedQuery}, topK: ${topK}`)

		// Semantic search uses the multilingual model - handles any language natively.
		// If embedding fails, degrade gracefully to keyword search instead of failing the tool.
		let semanticResults: IndexSearchResult[] = []
		try {
			semanticResults = await this.indexingService.search(query, candidateCount)
			this.logSearch(
				`[Skycode Search] Semantic: ${semanticResults.length} results | Top 3:`,
				semanticResults.slice(0, 3).map((r) => ({
					file: r.filePath.split(/[/\\]/).pop(),
					path: r.filePath,
					score: r.score.toFixed(3),
					lines: `${r.startLine + 1}-${r.endLine + 1}`,
				})),
			)
		} catch (error) {
			console.warn("[Skycode Indexing] Semantic search failed, falling back to keyword-only search:", error)
		}

		// Keyword search still runs (may catch exact matches in comments, strings, etc.)
		const chunks = this.indexingService.getStorage().getChunks()
		const keywordResults = keywordSearch(chunks, query, candidateCount)
		const pathResults = filePathSearch(chunks, query, candidateCount)
		this.logSearch(
			`[Skycode Search] Keyword: ${keywordResults.length} results | Top 3:`,
			keywordResults.slice(0, 3).map((r) => ({
				file: r.filePath.split(/[/\\]/).pop(),
				path: r.filePath,
				score: r.score.toFixed(3),
				lines: `${r.startLine + 1}-${r.endLine + 1}`,
			})),
		)
		this.logSearch(
			`[Skycode Search] Path: ${pathResults.length} results | Top 3:`,
			pathResults.slice(0, 3).map((r) => ({
				file: r.filePath.split(/[/\\]/).pop(),
				path: r.filePath,
				score: r.score.toFixed(3),
				lines: `${r.startLine + 1}-${r.endLine + 1}`,
			})),
		)

		const merged = this.mergeResults(semanticResults, keywordResults, pathResults, candidateCount, nonLatin, mixedQuery)
		this.logSearch(
			`[Skycode Search] Merged: ${merged.length} results | Top 3:`,
			merged.slice(0, 3).map((r) => ({
				file: r.filePath.split(/[/\\]/).pop(),
				path: r.filePath,
				score: r.score.toFixed(3),
				lines: `${r.startLine + 1}-${r.endLine + 1}`,
			})),
		)

		const reranked = rerankResults(merged, query)
		this.logSearch(
			`[Skycode Search] Reranked: ${reranked.length} results | Top 3:`,
			reranked.slice(0, 3).map((r) => ({
				file: r.filePath.split(/[/\\]/).pop(),
				path: r.filePath,
				score: r.score.toFixed(3),
				lines: `${r.startLine + 1}-${r.endLine + 1}`,
			})),
		)

		const final = reranked.slice(0, topK)
		this.logSearch(`[Skycode Search] Final: ${final.length} results returned`)
		return final
	}

	private mergeResults(
		semanticResults: IndexSearchResult[],
		keywordResults: IndexSearchResult[],
		pathResults: IndexSearchResult[],
		topK: number,
		nonLatinQuery: boolean = false,
		mixedQuery: boolean = false,
	): IndexSearchResult[] {
		const semMax = semanticResults.length > 0 ? Math.max(semanticResults[0].score, 1e-6) : 1
		const kwMax = keywordResults.length > 0 ? Math.max(keywordResults[0].score, 1e-6) : 1
		const pathMax = pathResults.length > 0 ? Math.max(pathResults[0].score, 1e-6) : 1
		const merged = new Map<
			string,
			{
				result: IndexSearchResult
				semScore: number
				kwScore: number
				pathScore: number
			}
		>()

		for (const result of semanticResults) {
			const key = `${result.filePath}:${result.startLine}:${result.endLine}`
			merged.set(key, {
				result,
				semScore: result.score / semMax,
				kwScore: 0,
				pathScore: 0,
			})
		}

		for (const result of keywordResults) {
			const key = `${result.filePath}:${result.startLine}:${result.endLine}`
			const existing = merged.get(key)
			if (existing) {
				existing.kwScore = result.score / kwMax
			} else {
				merged.set(key, {
					result,
					semScore: 0,
					kwScore: result.score / kwMax,
					pathScore: 0,
				})
			}
		}

		for (const result of pathResults) {
			const key = `${result.filePath}:${result.startLine}:${result.endLine}`
			const existing = merged.get(key)
			if (existing) {
				existing.pathScore = result.score / pathMax
			} else {
				merged.set(key, {
					result,
					semScore: 0,
					kwScore: 0,
					pathScore: result.score / pathMax,
				})
			}
		}

		// Adaptive weights: for non-Latin queries, semantic search dominates
		// because keyword matching against Latin code identifiers is mostly useless
		const SEMANTIC_WEIGHT = nonLatinQuery ? (mixedQuery ? 0.6 : 0.75) : 0.5
		const KEYWORD_WEIGHT = nonLatinQuery ? (mixedQuery ? 0.2 : 0.1) : 0.3
		const PATH_WEIGHT = nonLatinQuery ? (mixedQuery ? 0.2 : 0.15) : 0.2
		const finalResults = Array.from(merged.values()).map(({ result, semScore, kwScore, pathScore }) => ({
			...result,
			score: SEMANTIC_WEIGHT * semScore + KEYWORD_WEIGHT * kwScore + PATH_WEIGHT * pathScore,
		}))

		finalResults.sort((a, b) => b.score - a.score)
		return finalResults.slice(0, topK)
	}

	/**
	 * Search and format results as a context block for AI prompts.
	 * This is the main integration point with the Skycode prompt system.
	 *
	 * @param query - The user's message or query
	 * @param maxResults - Maximum number of results to include
	 * @param maxChars - Maximum total characters in the context block
	 * @returns Formatted string ready to inject into system/user prompt, or empty string if no results
	 */
	async getContextForPrompt(
		query: string,
		maxResults: number = 8,
		maxChars: number = 12000,
	): Promise<string> {
		const results = await this.search(query, maxResults)

		if (results.length === 0) {
			return ""
		}

		const parts: string[] = [
			"<codebase_context>",
			"The following code snippets from the user's codebase are semantically relevant to the current query.",
			"Use them as additional context when answering.",
			"",
		]

		let totalChars = parts.join("\n").length

		for (const result of results) {
			const formatted = formatResultForContext(result)
			if (totalChars + formatted.length + 2 > maxChars) {
				break
			}
			parts.push(formatted)
			parts.push("") // blank line separator
			totalChars += formatted.length + 1
		}

		parts.push("</codebase_context>")

		return parts.join("\n")
	}

	/**
	 * Check if the indexing system is ready (has an index with data).
	 */
	isReady(): boolean {
		const progress = this.indexingService.getProgress()
		return progress.status === "complete" && progress.chunksIndexed > 0
	}
}
