import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { EmptyRequest } from "@shared/proto/skycode/common"
import { AskResponseRequest, NewTaskRequest } from "@shared/proto/skycode/task"
import { useCallback, useEffect, useRef, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { TaskServiceClient } from "@/services/grpc-client"

export interface QueuedMessage {
	id: string
	text: string
	images: string[]
	files: string[]
}

export interface MessageQueueState {
	queue: QueuedMessage[]
	selectedIndex: number
}

export interface MessageQueueActions {
	addToQueue: (text: string, images: string[], files: string[]) => void
	sendNow: () => void // [→] - прервать AI и отправить первый
	removeSelected: () => void // [🗑] - удалить выбранный
	clearQueue: () => void // [✕] - очистить всю очередь
	selectItem: (index: number) => void
}

// [SKYCODE] Очередь по вкладкам: tabId -> сообщения
type QueuesByTab = Record<string, QueuedMessage[]>

// [SKYCODE] Автоотправка только для «простаивающих» ask. На approval-ask (command, tool, ...)
// messageResponse означает «отклонить с комментарием», поэтому очередь там не трогаем.
const IDLE_ASKS = new Set(["completion_result", "resume_completed_task", "followup", "plan_mode_respond", "resume_task"])

/** Дебаунс «Enter на пустом поле» — два Enter подряд отправляют только одно сообщение */
const SEND_NOW_DEBOUNCE_MS = 400

const FALLBACK_TAB_ID = "default"

// [SKYCODE] Зеркалит useMessageHandlers: resume_task -> yesButtonClicked, остальное -> messageResponse
function getResponseType(skycodeAsk: string | undefined): string {
	return skycodeAsk === "resume_task" ? "yesButtonClicked" : "messageResponse"
}

/** Survive webview remount (focus change, panel hide/show, host crash) — sessionStorage is per-tab. */
const QUEUE_STORAGE_KEY = "skycode.messageQueue.v2"

function isQueuedMessage(m: unknown): m is QueuedMessage {
	const x = m as QueuedMessage | null
	return !!x && typeof x.id === "string" && typeof x.text === "string" && Array.isArray(x.images) && Array.isArray(x.files)
}

function loadPersistedQueues(): QueuesByTab {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return {}
	}
	try {
		const raw = window.sessionStorage.getItem(QUEUE_STORAGE_KEY)
		if (!raw) {
			return {}
		}
		const parsed = JSON.parse(raw)
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
			return {}
		}
		const result: QueuesByTab = {}
		for (const [tabId, list] of Object.entries(parsed)) {
			if (Array.isArray(list)) {
				const items = list.filter(isQueuedMessage)
				if (items.length > 0) {
					result[tabId] = items
				}
			}
		}
		return result
	} catch {
		return {}
	}
}

function persistQueues(queues: QueuesByTab): void {
	if (typeof window === "undefined" || !window.sessionStorage) {
		return
	}
	try {
		if (Object.keys(queues).length === 0) {
			window.sessionStorage.removeItem(QUEUE_STORAGE_KEY)
		} else {
			window.sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queues))
		}
	} catch {
		// quota / disabled storage — non-critical
	}
}

const EMPTY_QUEUE: QueuedMessage[] = []

/**
 * Cursor-style message queue (по вкладкам).
 * Pure reactive - no timers, no polling.
 *
 * 1. AI working → messages go to queue of the active tab
 * 2. idle skycodeAsk appears + queue of this tab not empty → auto-send first
 * 3. [→] button → cancelTask → skycodeAsk appears → auto-send
 *
 * Survives webview remounts via sessionStorage so a mid-stream reload
 * (focus change, host restart) doesn't silently drop queued messages.
 */
export function useMessageQueue(_messages: SkycodeMessage[], skycodeAsk: string | undefined): MessageQueueState & MessageQueueActions {
	const { activeTabId, tabs } = useExtensionState()
	const tabId = activeTabId ?? FALLBACK_TAB_ID

	const [queues, setQueues] = useState<QueuesByTab>(() => loadPersistedQueues())
	const [selectedIndex, setSelectedIndex] = useState(0)
	const sendingRef = useRef(false) // prevent double-send (auto-effect and sendNow share it)
	const lastSendNowRef = useRef(0)
	// [SKYCODE] Актуальные значения для колбэков без устаревших замыканий
	const queuesRef = useRef(queues)
	const tabIdRef = useRef(tabId)
	const askRef = useRef(skycodeAsk)
	tabIdRef.current = tabId
	askRef.current = skycodeAsk

	const queue = queues[tabId] ?? EMPTY_QUEUE

	// Единая точка изменения: синхронно обновляет ref и state
	const updateQueue = useCallback((targetTabId: string, fn: (prev: QueuedMessage[]) => QueuedMessage[]) => {
		const prevAll = queuesRef.current
		const next = fn(prevAll[targetTabId] ?? EMPTY_QUEUE)
		const nextAll = { ...prevAll }
		if (next.length === 0) {
			delete nextAll[targetTabId]
		} else {
			nextAll[targetTabId] = next
		}
		queuesRef.current = nextAll
		setQueues(nextAll)
	}, [])

	// Persist whenever the queues change
	useEffect(() => {
		queuesRef.current = queues
		persistQueues(queues)
	}, [queues])

	// [SKYCODE] Чистим очереди закрытых вкладок
	useEffect(() => {
		if (!tabs || tabs.length === 0) {
			return
		}
		const alive = new Set(tabs.map((t) => t.id))
		const current = queuesRef.current
		const stale = Object.keys(current).filter((id) => id !== FALLBACK_TAB_ID && !alive.has(id))
		if (stale.length === 0) {
			return
		}
		const nextAll = { ...current }
		for (const id of stale) {
			delete nextAll[id]
		}
		queuesRef.current = nextAll
		setQueues(nextAll)
	}, [tabs])

	// При смене вкладки выбранный индекс сбрасываем
	// biome-ignore lint/correctness/useExhaustiveDependencies: сброс именно по смене tabId
	useEffect(() => {
		setSelectedIndex(0)
	}, [tabId])

	// Add message to queue
	const addToQueue = useCallback(
		(text: string, images: string[], files: string[]) => {
			updateQueue(tabIdRef.current, (prev) => [
				...prev,
				{
					id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					text,
					images,
					files,
				},
			])
		},
		[updateQueue],
	)

	// [→] Send now - interrupt AI and force-send first queued message
	const sendNow = useCallback(async () => {
		const now = Date.now()
		// [SKYCODE] Дебаунс: два Enter подряд -> одна отправка
		if (now - lastSendNowRef.current < SEND_NOW_DEBOUNCE_MS || sendingRef.current) {
			return
		}
		const currentTab = tabIdRef.current
		const firstMessage = (queuesRef.current[currentTab] ?? EMPTY_QUEUE)[0]
		if (!firstMessage) {
			return
		}
		lastSendNowRef.current = now

		const currentAsk = askRef.current
		if (!currentAsk) {
			// AI is working — cancel first and keep message in queue.
			// It will be auto-sent by the skycodeAsk effect as soon as ask state appears.
			console.log("[MessageQueue] sendNow - cancelling AI, then forcing send:", firstMessage.text)
			try {
				await TaskServiceClient.cancelTask(EmptyRequest.create({}))
			} catch (err) {
				console.error("[MessageQueue] cancelTask failed:", err)
			}
			return
		}

		// ask state already exists: send immediately and remove from queue
		sendingRef.current = true
		updateQueue(currentTab, (prev) => prev.slice(1))
		setSelectedIndex(0)

		// Send as askResponse (works for both "AI waiting" and "just cancelled" states)
		const responseType = getResponseType(currentAsk)
		console.log("[MessageQueue] sendNow - askResponse:", firstMessage.text, "responseType:", responseType)

		try {
			await TaskServiceClient.askResponse(
				AskResponseRequest.create({
					responseType,
					text: firstMessage.text,
					images: firstMessage.images,
					files: firstMessage.files,
				}),
			)
		} catch (err) {
			console.error("[MessageQueue] sendNow askResponse failed, trying newTask:", err)
			// Fallback: start as new task if askResponse fails
			try {
				await TaskServiceClient.newTask(
					NewTaskRequest.create({
						text: firstMessage.text,
						images: firstMessage.images,
					}),
				)
			} catch (err2) {
				console.error("[MessageQueue] sendNow newTask also failed:", err2)
			}
		} finally {
			sendingRef.current = false
		}
	}, [updateQueue])

	// Remove selected message
	const removeSelected = useCallback(() => {
		if (queue.length === 0) {
			return
		}
		updateQueue(tabIdRef.current, (prev) => prev.filter((_, i) => i !== selectedIndex))
		setSelectedIndex((prev) => Math.max(0, Math.min(prev, queue.length - 2)))
	}, [queue.length, selectedIndex, updateQueue])

	// Clear entire queue
	const clearQueue = useCallback(() => {
		updateQueue(tabIdRef.current, () => EMPTY_QUEUE)
		setSelectedIndex(0)
	}, [updateQueue])

	// Select item
	const selectItem = useCallback(
		(index: number) => {
			setSelectedIndex(Math.max(0, Math.min(index, queue.length - 1)))
		},
		[queue.length],
	)

	// CORE: React to skycodeAsk changes - auto-send when an idle ask appears and the current tab's queue has messages.
	// IMPORTANT: We must wait for the ask message to be fully complete (partial === false/undefined).
	// During streaming, ask messages arrive as partial=true first (e.g. followup question being typed),
	// and we must NOT consume the queue until the AI has fully finished writing its response.
	const lastMessage = _messages.at(-1)
	const isLastMessagePartial = lastMessage?.partial === true

	useEffect(() => {
		if (!skycodeAsk || !IDLE_ASKS.has(skycodeAsk) || queue.length === 0 || sendingRef.current || isLastMessagePartial) {
			return
		}

		// idle ask appeared, message is complete, and the active tab has queued messages - send first one
		sendingRef.current = true
		const firstMessage = queue[0]
		const sendTab = tabId

		const responseType = getResponseType(skycodeAsk)
		// allow-any-unicode-next-line
		console.log("[MessageQueue] skycodeAsk:", skycodeAsk, "→ auto-sending:", firstMessage.text, "responseType:", responseType)

		updateQueue(sendTab, (prev) => prev.slice(1))
		setSelectedIndex(0)

		TaskServiceClient.askResponse(
			AskResponseRequest.create({
				responseType,
				text: firstMessage.text,
				images: firstMessage.images,
				files: firstMessage.files,
			}),
		)
			.catch((err) => console.error("[MessageQueue] auto-send failed:", err))
			.finally(() => {
				sendingRef.current = false
			})
	}, [skycodeAsk, queue, tabId, isLastMessagePartial, updateQueue])

	return {
		queue,
		selectedIndex,
		addToQueue,
		sendNow,
		removeSelected,
		clearQueue,
		selectItem,
	}
}
