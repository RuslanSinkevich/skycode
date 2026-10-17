/**
 * [SKYCODE] Параметры выборки для Qwen3. Официальная инструкция Qwen3 прямо запрещает
 * жадное декодирование (температура 0): оно ведёт к бесконечным повторам — модель десятки раз
 * пишет один и тот же абзац, чаще всего в рассуждениях. Температура 0 к тому же попадает в
 * настройки сама: при правке модели в форму копируются значения по умолчанию.
 * Рекомендованные значения: temperature 0.6, top_p 0.95, top_k 20 (режим рассуждений).
 * Явно заданную ненулевую температуру не трогаем.
 */
export const QWEN_RECOMMENDED_TEMPERATURE = 0.6

export interface QwenSampling {
	temperature: number
	top_p: number
	top_k: number
}

export function isQwenModelId(modelId: string): boolean {
	return /qwen/i.test(modelId)
}

/** undefined — модель не Qwen, параметры не меняем */
export function qwenSampling(modelId: string, configuredTemperature: number | undefined): QwenSampling | undefined {
	if (!isQwenModelId(modelId)) {
		return undefined
	}
	const temperature =
		configuredTemperature !== undefined && Number.isFinite(configuredTemperature) && configuredTemperature > 0
			? configuredTemperature
			: QWEN_RECOMMENDED_TEMPERATURE
	return { temperature, top_p: 0.95, top_k: 20 }
}

// [SKYCODE] Строгие прокси/шлюзы отвечают 400 на неизвестные поля (top_k). Запоминаем такие baseUrl на процесс
// и дальше не шлём top_k/top_p.
const baseUrlsWithoutExtraSampling = new Set<string>()

function samplingKey(baseUrl: string | undefined): string {
	return (baseUrl ?? "").trim().toLowerCase().replace(/\/+$/, "")
}

export function isExtraSamplingUnsupported(baseUrl: string | undefined): boolean {
	return baseUrlsWithoutExtraSampling.has(samplingKey(baseUrl))
}

export function markExtraSamplingUnsupported(baseUrl: string | undefined): void {
	baseUrlsWithoutExtraSampling.add(samplingKey(baseUrl))
}

/** Сбрасывает запомненное (для тестов) */
export function resetExtraSamplingSupport(): void {
	baseUrlsWithoutExtraSampling.clear()
}

/** 400 с жалобой на top_k / неизвестные поля запроса */
export function isExtraSamplingRejection(error: unknown): boolean {
	const e = error as { status?: number; message?: unknown } | undefined
	if (!e || e.status !== 400) {
		return false
	}
	const message = String(e.message ?? "")
	return /top_k|unrecognized request argument|extra (fields|inputs)|unknown (field|parameter)|additional ?properties/i.test(message)
}
