import type { SkycodeMessage } from "@shared/ExtensionMessage"

export type ContextLevel = "normal" | "warning" | "critical"

/** 43500 -> "43.5k", 128000 -> "128k", 1_200_000 -> "1.2m". */
export function formatTokens(value: number): string {
	const trim = (n: number) => String(Number(n.toFixed(1)))
	if (value >= 1e6) {
		return `${trim(value / 1e6)}m`
	}
	if (value >= 1e3) {
		return `${trim(value / 1e3)}k`
	}
	return String(Math.round(value))
}

/** Токены последнего успешного запроса к модели — это и есть текущий размер контекста. */
export function getContextTokens(messages: SkycodeMessage[]): number {
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i]
		if (msg.say !== "api_req_started" || !msg.text) {
			continue
		}
		try {
			const info = JSON.parse(msg.text) as {
				tokensIn?: number
				tokensOut?: number
				cacheWrites?: number
				cacheReads?: number
			}
			const total = (info.tokensIn || 0) + (info.tokensOut || 0) + (info.cacheWrites || 0) + (info.cacheReads || 0)
			if (total > 0) {
				return total
			}
		} catch {
			// битое сообщение — смотрим предыдущее
		}
	}
	return 0
}

/** Доля заполнения окна контекста, 0..1. */
export function getFillRatio(tokens: number, contextWindow: number): number {
	if (!contextWindow || contextWindow <= 0) {
		return 0
	}
	return Math.min(1, Math.max(0, tokens / contextWindow))
}

/** Сколько токенов осталось до порога автосжатия (не меньше нуля); undefined, если порог неизвестен. */
export function getTokensUntilCompaction(tokens: number, thresholdTokens?: number): number | undefined {
	if (!thresholdTokens || thresholdTokens <= 0) {
		return undefined
	}
	return Math.max(0, thresholdTokens - tokens)
}

/** Цвет кольца: выше 70% порога автосжатия — предупреждение, выше 90% — критично. Без порога — по окну целиком. */
export function getContextLevel(tokens: number, thresholdTokens: number | undefined, contextWindow: number): ContextLevel {
	const base = thresholdTokens && thresholdTokens > 0 ? thresholdTokens : contextWindow
	if (!base || base <= 0) {
		return "normal"
	}
	const ratio = tokens / base
	if (ratio > 0.9) {
		return "critical"
	}
	if (ratio > 0.7) {
		return "warning"
	}
	return "normal"
}

export interface BreakdownSegment {
	category: string
	tokens: number
	/** Доля от суммы категорий, целые проценты (для подписей) */
	percent: number
	/** Доля от суммы категорий, точная (для ширины сегмента полосы), 0..100 */
	width: number
}

/** [SKYCODE] Бэкенд-разбивка контекста -> сегменты полосы: доли от суммы, категории < 1% скрыты. */
export function buildBreakdownSegments(breakdown: { category: string; tokens: number }[] | undefined): BreakdownSegment[] {
	const items = (breakdown ?? []).filter((item) => item.tokens > 0)
	const sum = items.reduce((total, item) => total + item.tokens, 0)
	if (sum <= 0) {
		return []
	}
	return items
		.map((item) => ({
			category: item.category,
			tokens: item.tokens,
			percent: Math.round((item.tokens / sum) * 100),
			width: (item.tokens / sum) * 100,
		}))
		.filter((segment) => segment.width >= 1)
}

/** Категория, занимающая больше 45% контекста (кроме системной — её не сократить), иначе undefined. */
export function getDominantCategory(segments: BreakdownSegment[]): string | undefined {
	return segments.find((segment) => segment.category !== "system" && segment.width > 45)?.category
}
