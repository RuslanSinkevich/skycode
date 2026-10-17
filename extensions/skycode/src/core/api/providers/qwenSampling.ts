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
