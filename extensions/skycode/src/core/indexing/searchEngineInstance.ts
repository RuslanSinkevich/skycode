/**
 * Singleton instance of SearchEngine.
 * Allows tool handlers to access the codebase search engine.
 */
import type { SearchEngine } from "./SearchEngine"

let _engine: SearchEngine | undefined

/** Set the global search engine instance */
export function setSearchEngine(e: SearchEngine): void {
	_engine = e
}

/** Get the global search engine instance */
export function getSearchEngine(): SearchEngine | undefined {
	return _engine
}
