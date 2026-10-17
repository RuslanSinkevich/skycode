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
		if (!item.ts || !item.task || openTaskIds.has(item.id)) {
			return false
		}
		return !needle || item.task.toLowerCase().includes(needle)
	})
}

/** Короткое относительное время («5 мин. назад», «вчера»), на языке интерфейса. */
export function formatRelativeTime(ts: number, now: number, locale: string): string {
	const diffSec = Math.round((ts - now) / 1000)
	const abs = Math.abs(diffSec)
	const formatter = new Intl.RelativeTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { numeric: "auto", style: "narrow" })
	if (abs < 60) {
		return formatter.format(0, "second")
	}
	if (abs < 3600) {
		return formatter.format(Math.trunc(diffSec / 60), "minute")
	}
	if (abs < 86400) {
		return formatter.format(Math.trunc(diffSec / 3600), "hour")
	}
	if (abs < 30 * 86400) {
		return formatter.format(Math.trunc(diffSec / 86400), "day")
	}
	if (abs < 365 * 86400) {
		return formatter.format(Math.trunc(diffSec / (30 * 86400)), "month")
	}
	return formatter.format(Math.trunc(diffSec / (365 * 86400)), "year")
}
