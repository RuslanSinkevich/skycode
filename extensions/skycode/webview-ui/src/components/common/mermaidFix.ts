/**
 * [SKYCODE] Починка частой ошибки моделей в схемах Mermaid: подписи со скобками, двоеточиями
 * и прочими спецсимволами без кавычек (`-->|typeof(Foo)|`, `A[Foo : Bar]`) — вся схема тогда
 * не разбирается. Берём такие подписи в кавычки. Только для flowchart/graph: в других видах
 * схем синтаксис другой.
 */
const SPECIAL = /[()[\]{}:;,#&<>]/

const quote = (label: string) => `"${label.trim().replace(/"/g, "#quot;")}"`

// Особые формы узлов (A[(db)], A[[sub]], A{{hex}}, A([stadium]), A[/x/], A[\x\]) не трогаем: кавычки их ломают
const needsQuote = (label: string) => SPECIAL.test(label) && !/^[([{/\\]/.test(label)

export function quoteMermaidLabels(code: string): string {
	const firstLine = code.trimStart().split("\n", 1)[0] ?? ""
	if (!/^(graph|flowchart)\b/i.test(firstLine)) {
		return code
	}
	return (
		code
			// Подписи стрелок: -->|текст|
			.replace(/\|([^|"\n]+)\|/g, (match, label: string) => (SPECIAL.test(label) ? `|${quote(label)}|` : match))
			// Подписи узлов: A[текст], A{текст}, A(текст) — по одной паре скобок
			.replace(/\b([A-Za-z_][\w-]*)\[([^\]"\n]+)\]/g, (match, id: string, label: string) =>
				needsQuote(label) ? `${id}[${quote(label)}]` : match,
			)
			.replace(/\b([A-Za-z_][\w-]*)\{([^}"\n]+)\}/g, (match, id: string, label: string) =>
				needsQuote(label) ? `${id}{${quote(label)}}` : match,
			)
			.replace(/\b([A-Za-z_][\w-]*)\(([^)"\n(]+)\)(?!\))/g, (match, id: string, label: string) =>
				needsQuote(label) ? `${id}(${quote(label)})` : match,
			)
	)
}
