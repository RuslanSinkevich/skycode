/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IndexSearchResult } from "@shared/IndexingTypes"

function extractQueryTokens(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[\s\-_.,;:!?()[\]{}<>"/\\|@#$%^&*+=~`]+/)
		.filter((token) => token.length > 2)
}

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function exactTokenBonus(result: IndexSearchResult, tokens: string[]): number {
	if (tokens.length === 0) {
		return 0
	}

	const content = result.content.toLowerCase()
	const isDefinition = /^(export\s+)?(function|class|interface|enum|struct|impl|def|async\s+function|const|let|var)\s+[a-zA-Z_$]/.test(
		result.content.trim(),
	)
	
	let matches = 0
	for (const token of tokens) {
		const tokenRegex = new RegExp(`(?<![a-z0-9_])${escapeRegex(token)}(?![a-z0-9_])`)
		if (tokenRegex.test(content)) {
			matches++
		}
	}

	// Base bonus for exact token match
	const baseBonus = (matches / tokens.length) * 0.15
	// Strong bonus if token appears in definition (class/function name)
	const definitionBonus = isDefinition && matches > 0 ? 0.2 : 0
	
	return baseBonus + definitionBonus
}

function pathBonus(result: IndexSearchResult, tokens: string[]): number {
	if (tokens.length === 0) {
		return 0
	}

	const path = result.filePath.toLowerCase()
	const fileName = path.split(/[/\\]/).pop() || ""
	let matches = 0
	let fileNameMatches = 0
	
	for (const token of tokens) {
		if (path.includes(token)) {
			matches++
		}
		// Strong bonus for exact match in filename (class/component name)
		if (fileName.includes(token)) {
			fileNameMatches++
		}
	}

	// Base path bonus
	const baseBonus = (matches / tokens.length) * 0.1
	// Strong bonus for filename match (indicates class/component name)
	const fileNameBonus = (fileNameMatches / tokens.length) * 0.3
	
	return baseBonus + fileNameBonus
}

function codeSignalBonus(result: IndexSearchResult): number {
	const hasDefinition = /^(export\s+)?(function|class|interface|enum|struct|impl|def|async\s+function)\s/m.test(
		result.content,
	)
	return hasDefinition ? 0.05 : 0
}

function noisePenalty(result: IndexSearchResult): number {
	const path = result.filePath.toLowerCase()
	if (path.includes("readme") || path.includes("/docs/") || path.includes("\\docs\\")) {
		return -0.05
	}
	if (path.includes("migration") || path.includes("/migrations/") || path.includes("\\migrations\\")) {
		return -0.04
	}
	if (path.includes(".test.") || path.includes(".spec.") || path.includes("__tests__")) {
		return -0.03
	}
	if (
		path.endsWith(".json") ||
		path.endsWith(".yaml") ||
		path.endsWith(".yml") ||
		path.endsWith(".toml")
	) {
		return -0.02
	}
	return 0
}

function phraseBonus(result: IndexSearchResult, tokens: string[]): number {
	if (tokens.length < 2) {
		return 0
	}

	const content = result.content.toLowerCase()
	let matchedPairs = 0
	for (let i = 0; i < tokens.length - 1; i++) {
		const a = tokens[i]
		const b = tokens[i + 1]
		if (
			content.includes(`${a} ${b}`) ||
			content.includes(`${a}_${b}`) ||
			content.includes(`${a}${b}`)
		) {
			matchedPairs++
		}
	}

	return Math.min((matchedPairs / Math.max(tokens.length - 1, 1)) * 0.1, 0.1)
}

export function rerankResults(results: IndexSearchResult[], query: string): IndexSearchResult[] {
	const tokens = extractQueryTokens(query)
	const reranked = results.map((result) => {
		const bonus =
			exactTokenBonus(result, tokens) +
			pathBonus(result, tokens) +
			codeSignalBonus(result) +
			noisePenalty(result) +
			phraseBonus(result, tokens)

		return {
			...result,
			score: result.score + bonus,
		}
	})

	reranked.sort((a, b) => b.score - a.score)
	return reranked
}
