/**
 * EmbeddingRouter — creates the appropriate embedding provider based on config.
 */
import type { IndexingConfig } from "@shared/IndexingTypes"
import type { EmbeddingProvider } from "./types"
import { EmbeddingWorkerManager } from "./workers/EmbeddingWorkerManager"
import { RemoteEmbeddingProvider } from "./providers/RemoteEmbeddingProvider"

/**
 * Creates an embedding provider based on the current indexing configuration.
 *
 * For "local" mode, returns an EmbeddingWorkerManager which runs embedding
 * computations in a separate Worker Thread — keeps the extension host responsive.
 *
 * @param config - Indexing configuration
 * @param extensionPath - Absolute path to the Skycode extension directory (for local model files)
 * @returns An EmbeddingProvider instance, or null if mode is "off"
 */
export function createEmbeddingProvider(
	config: IndexingConfig,
	extensionPath: string,
): EmbeddingProvider | null {
	switch (config.mode) {
		case "local":
			return new EmbeddingWorkerManager(extensionPath)

		case "remote": {
			if (!config.remoteApiUrl) {
				throw new Error("Remote API URL is required for remote embedding mode")
			}
			return new RemoteEmbeddingProvider(
				config.remoteApiUrl,
				config.remoteApiKey,
				config.remoteModel || "text-embedding-3-small",
			)
		}

		case "off":
		default:
			return null
	}
}
