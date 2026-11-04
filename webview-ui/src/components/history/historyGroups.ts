import type { HistoryItem } from "@shared/HistoryItem"

export type HistoryGroupKey = "today" | "yesterday" | "thisWeek" | "older"

export interface HistoryGroup {
	key: HistoryGroupKey
	items: HistoryItem[]
}

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(ts: number): number {
	const date = new Date(ts)
	date.setHours(0, 0, 0, 0)
	return date.getTime()
}

/** Куда попадает задача по дате: сегодня / вчера / последние 7 дней / ранее. */
export function getHistoryGroupKey(ts: number, now: number): HistoryGroupKey {
	const today = startOfDay(now)
	if (ts >= today) {
		return "today"
	}
	if (ts >= today - DAY_MS) {
		return "yesterday"
	}
	if (ts >= today - 6 * DAY_MS) {
		return "thisWeek"
	}
	return "older"
}

/** Группирует историю по датам (новые сверху); пустые группы не возвращает. */
export function groupHistoryByDate(items: HistoryItem[], now: number): HistoryGroup[] {
	const order: HistoryGroupKey[] = ["today", "yesterday", "thisWeek", "older"]
	const buckets: Record<HistoryGroupKey, HistoryItem[]> = { today: [], yesterday: [], thisWeek: [], older: [] }
	for (const item of [...items].sort((a, b) => b.ts - a.ts)) {
		buckets[getHistoryGroupKey(item.ts, now)].push(item)
	}
	return order.filter((key) => buckets[key].length > 0).map((key) => ({ key, items: buckets[key] }))
}

/**
 * Задачи для списка шторки: без уже открытых во вкладках, без пустых,
 * с фильтром по тексту задачи (без учёта регистра).
 */
export function filterHistoryForDrawer(items: HistoryItem[], openTaskIds: ReadonlySet<string>, query: string): HistoryItem[] {
	const needle = query.trim().toLowerCase()
	return items.filter((item) => {
		if (!item.ts || openTaskIds.has(item.id)) {
			return false
		}
		return !needle || (item.task ?? "").toLowerCase().includes(needle)
	})
}

/**
 * [SKYCODE] Название задачи для списка: у старых задач вместо названия сохранилась
 * служебная статистика запроса ({"tokensIn":…}) — её не показываем.
 */
export function displayTaskTitle(task: string | undefined, fallback: string): string {
	const text = task?.trim() ?? ""
	return !text || text.startsWith('{"') ? fallback : text
}

/**
 * [SKYCODE] Время в списке истории, как в мессенджерах: сегодня и вчера — часы и минуты
 * (группа уже говорит, какой день), на этой неделе — день недели, раньше — дата.
 */
export function formatHistoryTime(ts: number, now: number, locale: string): string {
	const lang = locale === "ru" ? "ru-RU" : "en-US"
	const key = getHistoryGroupKey(ts, now)
	const date = new Date(ts)
	if (key === "today" || key === "yesterday") {
		return date.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
	}
	if (key === "thisWeek") {
		return date.toLocaleDateString(lang, { weekday: "short" })
	}
	const sameYear = date.getFullYear() === new Date(now).getFullYear()
	return date.toLocaleDateString(lang, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
}
