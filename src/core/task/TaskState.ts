import { Anthropic } from "@anthropic-ai/sdk"
import { AssistantMessageContent } from "@core/assistant-message"
import type { ReadFileCacheEntry } from "./tools/handlers/readFileSlicing"
import type { HookExecution } from "./types/HookExecution"

export class TaskState {
	// Streaming flags
	isStreaming = false
	isWaitingForFirstChunk = false
	// [SKYCODE] Запрос к модели ждёт свободный слот в ApiSlotLimiter (статус «в очереди»)
	isWaitingForApiSlot = false
	didCompleteReadingStream = false

	// Content processing
	currentStreamingContentIndex = 0
	assistantMessageContent: AssistantMessageContent[] = []
	userMessageContent: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.ToolResultBlockParam)[] = []
	userMessageContentReady = false
	// Map of tool names to their tool_use_id for creating proper ToolResultBlockParam
	toolUseIdMap: Map<string, string> = new Map()
	// Track tool calls that have already had errors pushed (prevents duplicates during streaming)
	errorPushedForCallIds: Set<string> = new Set()

	// Presentation locks
	presentAssistantMessageLocked = false
	presentAssistantMessageHasPendingUpdates = false

	// Ask/Response handling (askResponse* removed - ApprovalGate manages this now)
	lastMessageTs?: number

	// Plan mode specific state
	isAwaitingPlanResponse = false
	didRespondToPlanAskBySwitchingMode = false

	// Context and history
	conversationHistoryDeletedRange?: [number, number]

	// Tool execution flags
	didRejectTool = false
	didAlreadyUseTool = false
	didEditFile: boolean = false
	lastToolName: string = "" // Track last tool used for consecutive call detection

	// Error tracking
	consecutiveMistakeCount: number = 0
	didAutomaticallyRetryFailedApiRequest = false

	// Retry tracking for auto-retry feature
	autoRetryAttempts: number = 0

	// Task Initialization
	isInitialized = false

	// Focus Chain / Todo List Management
	apiRequestCount: number = 0
	apiRequestsSinceLastTodoUpdate: number = 0
	currentFocusChainChecklist: string | null = null
	todoListWasUpdatedByUser: boolean = false

	// Task Abort / Cancellation
	abort: boolean = false
	softInterrupt: boolean = false // Soft interrupt - stop stream but continue task
	pendingUserMessage?: { text: string; images?: string[]; files?: string[] } // Message to inject after interrupt
	didFinishAbortingStream = false
	abandoned = false

	// Hook execution tracking for cancellation
	activeHookExecution?: HookExecution

	// Auto-context summarization
	currentlySummarizing: boolean = false
	lastAutoCompactTriggerIndex?: number

	// Session budget for weak/quantized models
	turnToolCallCount: number = 0
	consecutiveReadOnlyToolCalls: number = 0
	sessionBudgetExhausted: boolean = false

	// [SKYCODE] Сигнатуры последних вызовов инструментов для мягкой детекции повторов
	recentToolCallSignatures: string[] = []

	// Multi-step workflow
	isWorkflowStep = false
	stepCompleted = false
	isSilentStep = false

	// [SKYCODE] Последнее полное чтение файла по пути: для заглушки «файл не изменился» в read_file
	readFileCache: Map<string, ReadFileCacheEntry> = new Map()

	// [SKYCODE] Что уже отправлено в environment_details (чтобы не слать неизменившиеся секции)
	envDetailsCache?: import("./environmentDetailsDiff").EnvSectionCache

	// [SKYCODE] Напоминания todo-списка: когда последний раз слали (номер запроса) и слали ли полную инструкцию
	focusChainLastReminderRequest: number = -1
	focusChainFullInstructionsSent: boolean = false
	/** Ключ состояния истории (generation + deletedRange), при котором слали инструкции: сменился — шлём полные заново */
	focusChainHistoryKey?: string

	// [SKYCODE] Счётчик перезаписей apiConversationHistory (откат, правка, сжатие): кэши read_file/environment_details
	// и «полные инструкции todo» привязаны к нему и сбрасываются при смене
	historyGeneration: number = 0

	// [SKYCODE] Номер запроса (apiRequestCount), на котором последний раз запускали сжатие контекста
	lastCompactApiRequestCount?: number
	// [SKYCODE] Прошлый ответ был «объявлением действия» без вызова и уже получил подсказку продолжить
	nudgedIntentionOnly = false
}
