/**
 * [SKYCODE] Вкладки сессий: чистые функции (без зависимости от Task/vscode), чтобы их можно было тестировать.
 * Статус вкладки выводится из состояния задачи и её последнего сообщения.
 */

import type { SkycodeMessage, TabInfo, TabStatus } from "@shared/ExtensionMessage"

/** Вход для вывода статуса: только то, что нужно, а не весь Task. */
export interface TabStatusInput {
	/** Есть ли у сессии живая задача */
	hasTask: boolean
	/** Это сессия-заглушка из восстановленных вкладок (задача ещё не создана) */
	isPlaceholder?: boolean
	/** Задача ждёт свободный слот запроса к модели */
	isWaitingForApiSlot?: boolean
	/** Задача отменена/брошена */
	aborted?: boolean
	messages: ReadonlyArray<Pick<SkycodeMessage, "type" | "ask" | "say" | "partial">>
}

/**
 * Какие ask НЕ требуют от пользователя действия сейчас:
 * - completion_result — задача завершена (done);
 * - resume_* — задача остановлена и ждёт продолжения (stopped);
 * - command_output — вывод команды стримится, агент работает (running).
 * Всё остальное (одобрение инструмента/команды, вопрос, ошибка API, лимит ошибок…) — «ждёт пользователя».
 */
const NON_BLOCKING_ASKS = new Set(["completion_result", "resume_task", "resume_completed_task", "command_output"])

export function deriveTabStatus(input: TabStatusInput): TabStatus {
	if (input.isPlaceholder) {
		return "stopped"
	}
	if (!input.hasTask) {
		return "idle"
	}
	if (input.isWaitingForApiSlot) {
		return "queued"
	}
	const last = input.messages.at(-1)
	if (!last) {
		return "idle"
	}
	if (last.type === "ask" && !last.partial) {
		if (last.ask === "completion_result") {
			return "done"
		}
		if (last.ask === "resume_task" || last.ask === "resume_completed_task") {
			return "stopped"
		}
		if (last.ask && !NON_BLOCKING_ASKS.has(last.ask)) {
			return "awaiting"
		}
	}
	if (input.aborted) {
		return "stopped"
	}
	return "running"
}

const MAX_TITLE_LENGTH = 200

/** Одна строка без переносов, обрезанная; пустая строка, если текста нет. */
export function normalizeTabTitle(text: string | undefined): string {
	const oneLine = (text ?? "").replace(/\s+/g, " ").trim()
	return oneLine.length > MAX_TITLE_LENGTH ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1)}…` : oneLine
}

/**
 * Название вкладки: первая реплика задачи, иначе текст задачи из истории.
 * [SKYCODE] Skycode пишет первую реплику как say "text" (в Cline было say "task") — принимаем оба.
 * Служебный JSON (например статистика запроса {"tokensIn":…}) названием не бывает.
 */
export function deriveTabTitle(
	messages: ReadonlyArray<Pick<SkycodeMessage, "type" | "say" | "text">>,
	historyTaskText?: string,
): string {
	const first = messages[0]
	const firstText = first?.type === "say" && (first.say === "text" || first.say === "task") ? first.text : undefined
	return cleanTitle(firstText) || cleanTitle(historyTaskText)
}

function cleanTitle(text: string | undefined): string {
	const title = normalizeTabTitle(text)
	return title.startsWith("{\"") ? "" : title
}

/** Описание одной сессии для построения списка. */
export interface TabSource {
	sessionId: string
	taskId?: string
	placeholderTitle?: string
	status: TabStatus
	title: string
	ts: number
}

export function buildTabs(sources: TabSource[]): TabInfo[] {
	return sources.map((s) => ({
		id: s.sessionId,
		taskId: s.taskId ?? "",
		title: s.title || s.placeholderTitle || "",
		status: s.status,
		ts: s.ts,
	}))
}

// ---------------------------------------------------------------------------
// Сохранение открытых вкладок
// ---------------------------------------------------------------------------

export interface PersistedTab {
	sessionId: string
	taskId: string
}

/** Что сохраняем: только вкладки с задачей (пустые не нужны). activeTabId — только если эта вкладка сохраняется. */
export function toPersistedTabs(
	tabs: ReadonlyArray<Pick<TabInfo, "id" | "taskId">>,
	activeTabId: string | undefined,
): { openTabs: PersistedTab[]; activeTabId: string | undefined } {
	const openTabs = tabs.filter((t) => t.taskId).map((t) => ({ sessionId: t.id, taskId: t.taskId }))
	return {
		openTabs,
		activeTabId: openTabs.some((t) => t.sessionId === activeTabId) ? activeTabId : undefined,
	}
}

/**
 * Что восстанавливаем: вкладки, чьи задачи ещё есть в истории (дубликаты по sessionId/taskId отбрасываются).
 * Активная — сохранённая, если она уцелела, иначе первая.
 */
export function planRestoredTabs(
	saved: ReadonlyArray<PersistedTab> | undefined,
	savedActiveId: string | undefined,
	existingTaskIds: ReadonlySet<string>,
): { tabs: PersistedTab[]; activeId: string | undefined } {
	const seenSessions = new Set<string>()
	const seenTasks = new Set<string>()
	const tabs: PersistedTab[] = []
	for (const t of saved ?? []) {
		if (!t?.sessionId || !t?.taskId || !existingTaskIds.has(t.taskId)) {
			continue
		}
		if (seenSessions.has(t.sessionId) || seenTasks.has(t.taskId)) {
			continue
		}
		seenSessions.add(t.sessionId)
		seenTasks.add(t.taskId)
		tabs.push(t)
	}
	const activeId = tabs.some((t) => t.sessionId === savedActiveId) ? savedActiveId : tabs[0]?.sessionId
	return { tabs, activeId }
}
