import { hicapModelInfoSaneDefaults, ModelInfo } from "@shared/api"
import OpenAI from "openai"
import type { ChatCompletionReasoningEffort } from "openai/resources/chat/completions"
import { SkycodeStorageMessage } from "@/shared/messages/content"
import { ApiHandler, CommonApiHandlerOptions } from "../index"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { StreamAborter } from "../utils/abort-support"

interface OpenAiHandlerOptions extends CommonApiHandlerOptions {
	hicapApiKey?: string
	hicapModelId?: string
}

export class HicapHandler implements ApiHandler {
	private options: OpenAiHandlerOptions
	private client: OpenAI | undefined
	private aborter = new StreamAborter()

	constructor(options: OpenAiHandlerOptions) {
		this.options = options
	}

	abort(): void {
		this.aborter.abort()
	}

	private ensureClient(): OpenAI {
		if (!this.client) {
			if (!this.options.hicapApiKey) {
				throw new Error("Hicap API key is required")
			}
			if (!this.options.hicapModelId) {
				throw new Error("Model ID is required")
			}
			try {
				this.client = new OpenAI({
					baseURL: "https://api.hicap.ai/v2/openai",
					apiKey: this.options.hicapApiKey,
					defaultHeaders: {
						"api-key": this.options.hicapApiKey,
					},
				})
			} catch (error: any) {
				throw new Error(`Error creating OpenAI client: ${error.message}`)
			}
		}
		return this.client
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: SkycodeStorageMessage[]): ApiStream {
		const client = this.ensureClient()
		const modelId = this.options.hicapModelId ?? ""

		const openAiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
			{ role: "system", content: systemPrompt },
			...convertToOpenAiMessages(messages),
		]
		const temperature: number = 1
		let reasoningEffort: ChatCompletionReasoningEffort | undefined
		let maxTokens: number | undefined

		const signal = this.aborter.reset()
		const stream = await client.chat.completions.create({
			model: modelId,
			messages: openAiMessages,
			temperature,
			max_tokens: maxTokens,
			reasoning_effort: reasoningEffort,
			stream: true,
			stream_options: { include_usage: true },
		},
			{ signal },
		)
		this.aborter.track(stream)
		try {
		for await (const chunk of stream) {
			const delta = chunk.choices?.[0]?.delta
			if (delta?.content) {
				yield {
					type: "text",
					text: delta.content,
				}
			}

			if (delta && "reasoning_content" in delta && delta.reasoning_content) {
				yield {
					type: "reasoning",
					reasoning: (delta.reasoning_content as string | undefined) || "",
				}
			}

			if (chunk.usage) {
				const promptTokens = chunk.usage.prompt_tokens || 0
				const cachedTokens = (chunk.usage as { prompt_tokens_details?: { cached_tokens?: number } }).prompt_tokens_details?.cached_tokens || 0
				const cacheMissTokens = (chunk.usage as { prompt_cache_miss_tokens?: number }).prompt_cache_miss_tokens || 0
				yield {
					type: "usage",
					inputTokens: promptTokens - cachedTokens,
					outputTokens: chunk.usage.completion_tokens || 0,
					cacheReadTokens: cachedTokens,
					cacheWriteTokens: cacheMissTokens,
				}
			}
		}
		} finally {
			this.aborter.clear()
		}
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: this.options.hicapModelId ?? "",
			info: hicapModelInfoSaneDefaults,
		}
	}
}
