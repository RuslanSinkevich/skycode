// [SKYCODE] Типы долговременной памяти, общие для расширения и webview (core/memory — логика и файлы).

export type MemoryEntryType = "user" | "preference" | "project"
export type MemoryEntryStatus = "probation" | "stable"

/** Запись в том виде, в каком её показывает интерфейс. */
export interface MemoryEntryView {
	id: string
	type: MemoryEntryType
	text: string
	status: MemoryEntryStatus
	created: string
	updated: string
}

export type MemorySayAction = "added" | "updated" | "confirmed" | "forgot"

/**
 * Нагрузка say("memory") — служебная строка в чате. `entry` — запись после действия (для forgot — удалённая),
 * `previous` — запись до обновления; оба хранят полные данные, чтобы «Отменить» восстановило запись как была.
 */
export interface MemorySayPayload {
	action: MemorySayAction
	scope: "global" | "project"
	entry: MemoryEntryView & Record<string, unknown>
	previous?: MemoryEntryView & Record<string, unknown>
	undone?: boolean
}

/** Ответ getMemory: обе памяти для текущей рабочей папки. */
export interface MemoryListResponse {
	enabled: boolean
	projectFolder?: string
	global: MemoryEntryView[]
	project: MemoryEntryView[]
}

export function parseMemorySayPayload(text: string | undefined): MemorySayPayload | null {
	if (!text) {
		return null
	}
	try {
		const data = JSON.parse(text) as MemorySayPayload
		if (!data?.entry?.id || typeof data.entry.text !== "string" || !data.action) {
			return null
		}
		return data
	} catch {
		return null
	}
}
