/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IndexSearchResult } from "@shared/IndexingTypes"
import type { ChunkRow } from "../types"

function extractTokens(query: string): string[] {
	return query
		.toLowerCase()
		.split(/[\s\-_.,;:!?()[\]{}<>"/\\|@#$%^&*+=~`]+/)
		.filter((token) => token.length > 2)
}

function scoreChunk(chunk: ChunkRow, tokens: string[]): number {
	if (tokens.length === 0) {
		return 0
	}

	const contentLower = chunk.content.toLowerCase()
	const pathLower = chunk.filePath.toLowerCase()
	const fileName = pathLower.split(/[/\\]/).pop() || ""
	let score = 0

	for (const token of tokens) {
		// Exact match in content
		if (contentLower.includes(token)) {
			score += 1.0
		}
		// Exact match in file path
		if (pathLower.includes(token)) {
			score += 0.5
		}
		// Strong bonus for exact match in filename (class/component name)
		if (fileName.includes(token)) {
			score += 2.0
		}
	}

	const maxScore = tokens.length * 3.5 // Increased due to filename bonus
	return maxScore > 0 ? score / maxScore : 0
}

export function keywordSearch(
	chunks: ChunkRow[],
	query: string,
	topK: number = 10,
	threshold: number = 0.1,
): IndexSearchResult[] {
	const tokens = extractTokens(query)
	if (tokens.length === 0) {
		return []
	}

	const scored: Array<{ chunk: ChunkRow; score: number }> = []
	for (const chunk of chunks) {
		const score = scoreChunk(chunk, tokens)
		if (score >= threshold) {
			scored.push({ chunk, score })
		}
	}

	scored.sort((a, b) => b.score - a.score)
	return scored.slice(0, topK).map(({ chunk, score }) => ({
		filePath: chunk.filePath,
		content: chunk.content,
		startLine: chunk.startLine,
		endLine: chunk.endLine,
		score,
		language: chunk.language,
	}))
}

export function filePathSearch(chunks: ChunkRow[], query: string, topK: number = 10): IndexSearchResult[] {
	const tokens = extractTokens(query)
	if (tokens.length === 0) {
		return []
	}

	const bestByPath = new Map<string, { chunk: ChunkRow; score: number }>()
	for (const chunk of chunks) {
		const pathLower = chunk.filePath.toLowerCase()
		let score = 0
		for (const token of tokens) {
			if (pathLower.includes(token)) {
				score += 1
			}
		}
		if (score === 0) {
			continue
		}
		const normalized = score / tokens.length
		const existing = bestByPath.get(chunk.filePath)
		if (!existing || normalized > existing.score) {
			bestByPath.set(chunk.filePath, { chunk, score: normalized })
		}
	}

	return Array.from(bestByPath.values())
		.sort((a, b) => b.score - a.score)
		.slice(0, topK)
		.map(({ chunk, score }) => ({
			filePath: chunk.filePath,
			content: chunk.content,
			startLine: chunk.startLine,
			endLine: chunk.endLine,
			score,
			language: chunk.language,
		}))
}
