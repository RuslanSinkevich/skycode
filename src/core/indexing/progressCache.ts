/**
 * In-memory cache for indexing progress.
 * Avoids slow workspaceState disk I/O for real-time progress updates.
 */
import type { IndexingProgress } from "@shared/IndexingTypes"

let _progress: IndexingProgress | undefined

export function setIndexingProgress(p: IndexingProgress): void {
	_progress = p
}

export function getIndexingProgress(): IndexingProgress | undefined {
	return _progress
}
