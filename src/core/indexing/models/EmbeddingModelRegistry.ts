/**
 * Registry of local embedding models available for codebase indexing.
 *
 * Each model has a user-facing id ("mini" / "base" / "large"), mapped to the
 * concrete HuggingFace repo (under the Xenova mirror, which provides ONNX/quantized
 * variants compatible with @xenova/transformers).
 *
 * downloadUrl is optional:
 *   - If set, embedding-worker.ts will download+unpack the model on first use.
 *   - If empty, the model is expected to already be present at
 *     `<extensionPath>/models/<huggingFaceId>/onnx/model_quantized.onnx`.
 *
 * The E5 family ("base", "large") requires the "query: " / "passage: " prefix on
 * inputs — this is controlled by `requiresPrefix` and handled in embedding-worker.ts.
 */

import type { LocalModelId } from "../../../shared/IndexingTypes"

export interface EmbeddingModelMeta {
	/** User-facing id used in settings and IndexingConfig.localModel */
	id: LocalModelId
	/** HuggingFace repo path, e.g. "Xenova/paraphrase-multilingual-MiniLM-L12-v2" */
	huggingFaceId: string
	/** Embedding vector dimensionality */
	dimensions: number
	/** Whether the model expects "query: " / "passage: " prefix (E5 family) */
	requiresPrefix: boolean
	/** Optional download URL (zip with onnx/model_quantized.onnx + tokenizer) */
	downloadUrl: string
}

const MODEL_CDN = "https://storage.yandexcloud.net/skycode-releases"

const REGISTRY: Record<LocalModelId, EmbeddingModelMeta> = {
	mini: {
		id: "mini",
		huggingFaceId: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
		dimensions: 384,
		requiresPrefix: false,
		downloadUrl: `${MODEL_CDN}/paraphrase-multilingual-MiniLM-L12-v2.zip`,
	},
	base: {
		id: "base",
		huggingFaceId: "Xenova/multilingual-e5-base",
		dimensions: 768,
		requiresPrefix: true,
		downloadUrl: `${MODEL_CDN}/multilingual-e5-base.zip`,
	},
	large: {
		id: "large",
		huggingFaceId: "Xenova/multilingual-e5-large",
		dimensions: 1024,
		requiresPrefix: true,
		downloadUrl: `${MODEL_CDN}/multilingual-e5-large.zip`,
	},
}

/** Get model metadata by id. Falls back to "mini" for unknown ids. */
export function getModelMeta(id: LocalModelId | string | undefined): EmbeddingModelMeta {
	if (id && id in REGISTRY) {
		return REGISTRY[id as LocalModelId]
	}
	return REGISTRY.mini
}

/** List all registered models (for UI selectors). */
export function listModels(): EmbeddingModelMeta[] {
	return Object.values(REGISTRY)
}

/**
 * Resolve model id to metadata. The embedding worker may load weights from
 * `extensionPath/models/<huggingFaceId>/` or, if missing, from Hugging Face
 * (see `allowRemoteModels` in embedding-worker.ts).
 */
export function resolveModelMetaForPath(
	_extensionPath: string,
	id: LocalModelId | string | undefined,
): EmbeddingModelMeta {
	return getModelMeta(id)
}
