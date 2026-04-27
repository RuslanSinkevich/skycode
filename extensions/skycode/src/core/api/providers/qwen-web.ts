import crypto from "crypto"
import type { ChatCompletionTool as OpenAITool } from "openai/resources/chat/completions"
import { ModelInfo, QwenWebModelId, qwenWebDefaultModelId, qwenWebModels } from "@shared/api"
import { SkycodeStorageMessage } from "@/shared/messages/content"
import { fetch } from "@/shared/net"
import { Logger } from "@/shared/services/Logger"
import { ApiHandler, CommonApiHandlerOptions } from "../"
import { withRetry } from "../retry"
import { convertToOpenAiMessages } from "../transform/openai-format"
import { ApiStream } from "../transform/stream"
import { ToolCallProcessor } from "../transform/tool-call-processor"

/**
 * Qwen Web provider — talks to the public chat.qwen.ai web API using a
 * browser-session bearer token. NOT an official API. The user extracts the
 * token manually from localStorage on chat.qwen.ai and puts it in settings.
 * Free for personal use, session-bound, rate-limited on the account level.
 *
 * This provider is intentionally self-contained: delete this file and the
 * single `case "qwen-web"` in core/api/index.ts to remove it completely.
 */

const QWEN_BASE_URL = "https://chat.qwen.ai"
const CREATE_CHAT_URL = `${QWEN_BASE_URL}/api/v2/chats/new`
const CHAT_COMPLETIONS_URL = `${QWEN_BASE_URL}/api/v2/chat/completions`

/**
 * Flatten a multi-turn OpenAI-style conversation into a single user message
 * that Qwen Web can understand. Qwen Web v2 API doesn't accept assistant/tool
 * roles in the messages array — the server maintains history via parent_id.
 * Since we don't persist chat state across createMessage calls, we re-inject
 * the conversation as plain text markers.
 *
 * The last user message is preserved verbatim at the end so the model focuses
 * on answering it. Earlier turns are prefixed with role markers.
 */
function flattenConversationForQwenWeb(openAiMessages: any[]): string {
	if (openAiMessages.length === 0) return ""
	if (openAiMessages.length === 1) {
		return stringifyMessageContent(openAiMessages[0].content)
	}

	const history = openAiMessages.slice(0, -1)
	const last = openAiMessages[openAiMessages.length - 1]

	const historyText = history
		.map((m) => {
			const content = stringifyMessageContent(m.content)
			switch (m.role) {
				case "assistant": {
					const toolCallsText =
						m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0
							? `\n[Tool calls: ${JSON.stringify(m.tool_calls)}]`
							: ""
					return `=== Assistant ===\n${content}${toolCallsText}`
				}
				case "tool":
					return `=== Tool result (${m.tool_call_id ?? m.name ?? ""}) ===\n${content}`
				case "user":
					return `=== User ===\n${content}`
				case "system":
					return `=== System ===\n${content}`
				default:
					return `=== ${m.role} ===\n${content}`
			}
		})
		.join("\n\n")

	const lastText = stringifyMessageContent(last.content)
	if (last.role === "user") {
		return `${historyText}\n\n=== Current user message ===\n${lastText}`
	}
	return `${historyText}\n\n=== ${last.role} ===\n${lastText}`
}

function stringifyMessageContent(content: any): string {
	if (content == null) return ""
	if (typeof content === "string") return content
	if (Array.isArray(content)) {
		return content
			.map((part: any) => {
				if (typeof part === "string") return part
				if (part?.type === "text") return String(part.text ?? "")
				if (part?.type === "image_url") return "[image]"
				return ""
			})
			.join("")
	}
	try {
		return JSON.stringify(content)
	} catch {
		return String(content)
	}
}

interface QwenWebHandlerOptions extends CommonApiHandlerOptions {
	qwenWebToken?: string
	apiModelId?: string
}

interface QwenCreateChatResponse {
	data?: { id?: string }
	id?: string
	success?: boolean
}

export class QwenWebHandler implements ApiHandler {
	private options: QwenWebHandlerOptions

	constructor(options: QwenWebHandlerOptions) {
		this.options = options
	}

	getModel(): { id: QwenWebModelId; info: ModelInfo } {
		const raw = this.options.apiModelId as string | undefined
		// If apiModelId leaked from another provider (e.g. "claude-sonnet-4"), fall back to qwen-web default.
		const modelId: QwenWebModelId = raw && raw in qwenWebModels ? (raw as QwenWebModelId) : qwenWebDefaultModelId
		const info = qwenWebModels[modelId]
		return { id: modelId, info }
	}

	private ensureToken(): string {
		const token = (this.options.qwenWebToken || "").trim()
		if (!token) {
			throw new Error(
				"Требуется токен Qwen Web. Откройте https://chat.qwen.ai, войдите, затем в DevTools → Application → Local Storage скопируйте значение ключа 'token' и вставьте его в настройки API Skycode.",
			)
		}
		return token
	}

	private async createChat(token: string, modelId: string): Promise<string> {
		const payload = {
			title: "Skycode",
			models: [modelId],
			chat_mode: "normal",
			chat_type: "t2t",
			timestamp: Date.now(),
		}

		const response = await fetch(CREATE_CHAT_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Accept: "application/json, text/plain, */*",
				Origin: QWEN_BASE_URL,
				Referer: `${QWEN_BASE_URL}/`,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			const body = await response.text().catch(() => "")
			throw new Error(`Qwen Web: failed to create chat (${response.status}): ${body.slice(0, 200)}`)
		}

		const data = (await response.json().catch(() => ({}))) as QwenCreateChatResponse
		const chatId = data?.data?.id ?? data?.id
		if (!chatId) {
			throw new Error("Qwen Web: missing chat_id in create-chat response")
		}
		return chatId
	}

	@withRetry()
	async *createMessage(systemPrompt: string, messages: SkycodeStorageMessage[], tools?: OpenAITool[]): ApiStream {
		const token = this.ensureToken()
		const model = this.getModel()

		const chatId = await this.createChat(token, model.id)

		// Qwen Web API v2 stores chat history server-side via parent_id chain —
		// it does NOT accept OpenAI-style multi-turn arrays. If we pass more than
		// one message with assistant turns, it silently returns an empty stream.
		//
		// Since we create a fresh chat per createMessage call, we flatten the
		// entire conversation into one user message and pass systemPrompt via
		// the separate `system_message` field (matching the reference FreeQwenApi).
		const openAiMessages = convertToOpenAiMessages(messages)
		const flattenedUserContent = flattenConversationForQwenWeb(openAiMessages)

		const userMessageId = crypto.randomUUID()
		const assistantChildId = crypto.randomUUID()
		const nowSec = Math.floor(Date.now() / 1000)

		const newMessage = {
			fid: userMessageId,
			parentId: null,
			parent_id: null,
			role: "user",
			content: flattenedUserContent,
			chat_type: "t2t",
			sub_chat_type: "t2t",
			timestamp: nowSec,
			user_action: "chat",
			models: [model.id],
			files: [],
			childrenIds: [assistantChildId],
			extra: { meta: { subChatType: "t2t" } },
			feature_config: { thinking_enabled: false, output_schema: "phase" },
		}

		const payload: Record<string, any> = {
			stream: true,
			incremental_output: true,
			chat_id: chatId,
			chat_mode: "normal",
			messages: [newMessage],
			model: model.id,
			parent_id: null,
			timestamp: nowSec,
		}

		if (systemPrompt) {
			payload.system_message = systemPrompt
		}

		if (tools && tools.length > 0) {
			payload.tools = tools
			payload.tool_choice = "auto"
		}

		const url = `${CHAT_COMPLETIONS_URL}?chat_id=${chatId}`
		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${token}`,
				Accept: "text/event-stream",
				Origin: QWEN_BASE_URL,
				Referer: `${QWEN_BASE_URL}/c/${chatId}`,
			},
			body: JSON.stringify(payload),
		})

		if (!response.ok) {
			const errorBody = await response.text().catch(() => "")
			throw new Error(`Qwen Web: request failed (${response.status}): ${errorBody.slice(0, 500)}`)
		}

		const reader = (response.body as any)?.getReader?.()
		if (!reader) {
			const body = await response.text().catch(() => "")
			throw new Error(`Qwen Web: streaming not supported by runtime fetch. Body: ${body.slice(0, 200)}`)
		}

		const decoder = new TextDecoder()
		const toolCallProcessor = new ToolCallProcessor()
		let buffer = ""
		let promptTokens = 0
		let completionTokens = 0
		let sawAnyContent = false

		try {
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				const lines = buffer.split("\n")
				buffer = lines.pop() ?? ""

				for (const raw of lines) {
					const line = raw.trim()
					if (!line || !line.startsWith("data:")) continue
					const jsonStr = line.slice(5).trim()
					if (!jsonStr || jsonStr === "[DONE]") continue

					let chunk: any
					try {
						chunk = JSON.parse(jsonStr)
					} catch {
						continue
					}
					if (chunk?.code === "RateLimited") {
						throw new Error(`Qwen Web: rate limited (${JSON.stringify(chunk).slice(0, 200)})`)
					}
					if (chunk?.error && !chunk?.choices) {
						throw new Error(`Qwen Web: ${JSON.stringify(chunk.error).slice(0, 300)}`)
					}

					const choice = chunk?.choices?.[0]
					const delta = choice?.delta

					if (delta?.content) {
						sawAnyContent = true
						yield { type: "text", text: String(delta.content) }
					}

					if (delta?.reasoning_content) {
						sawAnyContent = true
						yield { type: "reasoning", reasoning: String(delta.reasoning_content) }
					}

					if (delta?.tool_calls) {
						sawAnyContent = true
						try {
							yield* toolCallProcessor.processToolCallDeltas(delta.tool_calls)
						} catch (error) {
							Logger.error("Qwen Web: error processing tool call delta", error, delta.tool_calls)
						}
					}

					if (chunk?.usage) {
						promptTokens = chunk.usage.prompt_tokens ?? promptTokens
						completionTokens = chunk.usage.completion_tokens ?? completionTokens
					}
				}
			}
		} finally {
			try {
				reader.releaseLock?.()
			} catch {
				// ignore
			}
		}

		if (!sawAnyContent) {
			throw new Error(
				"Qwen Web: пустой ответ. Возможно, токен сессии истёк или диалог стал слишком длинным. " +
					"Начните новый чат или обновите токен на https://chat.qwen.ai.",
			)
		}

		yield {
			type: "usage",
			inputTokens: promptTokens,
			outputTokens: completionTokens,
		}
	}
}
