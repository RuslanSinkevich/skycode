// [SKYCODE] Оценка структуры контекста по категориям (для окошка кольца контекста, как /context в Claude Code).
// Чистая функция: на вход — реально отправляемые сообщения, размеры системного промпта и описаний инструментов.

export type ContextCategory = "system" | "files" | "commands" | "edits" | "conversation" | "environment" | "other"

export interface ContextBreakdownItem {
	category: ContextCategory
	tokens: number
}

interface MessageLike {
	role: string
	content: string | Array<Record<string, any>>
}

export interface ContextBreakdownInput {
	/** Сообщения, которые реально уходят модели (уже без удалённого диапазона) */
	messages: MessageLike[]
	/** Длина системного промпта в символах */
	systemPromptChars?: number
	/** Длина JSON описаний нативных инструментов в символах */
	toolsChars?: number
	/** Реальный размер контекста по последнему запросу — к нему масштабируется сумма категорий */
	realTotalTokens?: number
}

const FILE_TOOLS = new Set([
	"read_file",
	"read_symbol",
	"search_files",
	"list_files",
	"list_code_definition_names",
	"glob",
	"grep",
])
const COMMAND_TOOLS = new Set(["execute_command", "check_background_command"])
const EDIT_TOOLS = new Set(["write_to_file", "replace_in_file", "replace_text", "apply_patch"])

const ENV_RE = /<environment_details>[\s\S]*?(?:<\/environment_details>|$)/g
const FILE_CONTENT_RE = /<file_content\b[\s\S]*?(?:<\/file_content>|$)/g
const RESULT_PREFIX_RE = /^\s*\[([a-z_][a-z0-9_]*)(?: for [^\]]*)?\] Result:/

const CYRILLIC_RE = /[Ѐ-ӿ]/g

/**
 * Грубая оценка токенов: ~3.5 символа на токен для латиницы, ~2.8 если >30% символов — кириллица.
 * Точное значение не важно: сумма потом масштабируется к реальному числу токенов из API.
 */
export function estimateTokens(text: string): number {
	if (!text) {
		return 0
	}
	const cyrillic = text.match(CYRILLIC_RE)?.length ?? 0
	const divisor = cyrillic / text.length > 0.3 ? 2.8 : 3.5
	return text.length / divisor
}

function toolCategory(toolName: string | undefined): ContextCategory | undefined {
	if (!toolName) {
		return undefined
	}
	if (FILE_TOOLS.has(toolName)) {
		return "files"
	}
	if (COMMAND_TOOLS.has(toolName)) {
		return "commands"
	}
	if (EDIT_TOOLS.has(toolName)) {
		return "edits"
	}
	return undefined
}

function add(acc: Record<ContextCategory, number>, category: ContextCategory, text: string) {
	acc[category] += estimateTokens(text)
}

/** Текстовый блок: выделяет environment_details и <file_content>, остаток относит по префиксу результата или к fallback. */
function classifyText(acc: Record<ContextCategory, number>, text: string, fallback: ContextCategory, toolName?: string) {
	let rest = text.replace(ENV_RE, (m) => {
		add(acc, "environment", m)
		return ""
	})
	const prefixTool = RESULT_PREFIX_RE.exec(rest)?.[1] ?? toolName
	const resultCategory = toolCategory(prefixTool)
	if (resultCategory) {
		add(acc, resultCategory, rest)
		return
	}
	rest = rest.replace(FILE_CONTENT_RE, (m) => {
		add(acc, "files", m)
		return ""
	})
	if (prefixTool) {
		// результат прочего инструмента (MCP, browser, ask_followup и т.д.)
		add(acc, "other", rest)
		return
	}
	add(acc, fallback, rest)
}

export function estimateContextBreakdown(input: ContextBreakdownInput): ContextBreakdownItem[] {
	const acc: Record<ContextCategory, number> = {
		system: (input.systemPromptChars ?? 0) / 3.5 + (input.toolsChars ?? 0) / 3.5,
		files: 0,
		commands: 0,
		edits: 0,
		conversation: 0,
		environment: 0,
		other: 0,
	}

	const toolNames = new Map<string, string>()
	for (const message of input.messages) {
		if (!Array.isArray(message.content)) {
			continue
		}
		for (const block of message.content) {
			if (block.type === "tool_use" && block.id && block.name) {
				toolNames.set(block.id, block.name)
			}
		}
	}

	for (const message of input.messages) {
		const fallback: ContextCategory = "conversation"
		if (typeof message.content === "string") {
			classifyText(acc, message.content, fallback)
			continue
		}
		for (const block of message.content) {
			switch (block.type) {
				case "text":
					classifyText(acc, String(block.text ?? ""), fallback)
					break
				case "thinking":
					add(acc, "conversation", String(block.thinking ?? ""))
					break
				case "redacted_thinking":
					add(acc, "conversation", String(block.data ?? ""))
					break
				case "tool_use": {
					const text = JSON.stringify(block.input ?? {})
					add(acc, EDIT_TOOLS.has(block.name) ? "edits" : "conversation", text)
					break
				}
				case "tool_result": {
					const name = toolNames.get(block.tool_use_id)
					const parts = Array.isArray(block.content) ? block.content : [{ type: "text", text: block.content }]
					for (const part of parts) {
						if (part?.type === "text" && typeof part.text === "string") {
							classifyText(acc, part.text, "other", name ?? "unknown")
						} else if (part?.type === "image") {
							acc.other += 800
						}
					}
					break
				}
				case "image":
					acc.other += 800
					break
				default:
					add(acc, "other", JSON.stringify(block))
			}
		}
	}

	const order: ContextCategory[] = ["system", "files", "commands", "edits", "conversation", "environment", "other"]
	const sum = order.reduce((s, c) => s + acc[c], 0)
	const real = input.realTotalTokens
	const scale = real && real > 0 && sum > 0 ? real / sum : 1
	return order
		.map((category) => ({ category, tokens: Math.round(acc[category] * scale) }))
		.filter((item) => item.tokens > 0)
}
