// [SKYCODE] Провайдеры, показанные в выпадающем списке сразу. Остальные лежат под «Ещё провайдеры»,
// но поиск находит все. Порядок здесь — порядок в списке.
export const MAIN_PROVIDER_VALUES = ["openai", "ollama", "lmstudio", "gigachat", "yandexgpt", "qwen", "qwen-code"]

/** Делит провайдеров на основную группу (в заданном порядке) и остальные (в исходном порядке). */
export function splitProviders<T extends { value: string }>(items: T[]): { main: T[]; more: T[] } {
	const main = MAIN_PROVIDER_VALUES.map((value) => items.find((item) => item.value === value)).filter(
		(item): item is T => item !== undefined,
	)
	const more = items.filter((item) => !MAIN_PROVIDER_VALUES.includes(item.value))
	return { main, more }
}

/** Та же раскладка для результатов поиска: порядок релевантности сохраняется внутри групп. */
export function partitionProviders<T extends { value: string }>(items: T[]): { main: T[]; more: T[] } {
	return {
		main: items.filter((item) => MAIN_PROVIDER_VALUES.includes(item.value)),
		more: items.filter((item) => !MAIN_PROVIDER_VALUES.includes(item.value)),
	}
}
