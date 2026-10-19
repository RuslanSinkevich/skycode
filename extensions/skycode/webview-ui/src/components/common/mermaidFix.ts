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

/** Яркость цвета #rgb / #rrggbb (0–1) или undefined, если это не hex */
function hexLuminance(color: string): number | undefined {
	const hex = color.trim().replace(/^#/, "")
	const full = hex.length === 3 ? hex.replace(/./g, "$&$&") : hex
	if (!/^[0-9a-f]{6}$/i.test(full)) {
		return undefined
	}
	const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255)
	return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * [SKYCODE] Модели красят блоки (`style A fill:#fff3e0`, `classDef x fill:#e1f5fe`) пастелью под светлый фон.
 * В светлой теме дописываем только читаемый цвет текста, если он не задан. В тёмной теме яркие
 * пастельные плашки режут глаз и выбиваются из темы — делаем из них лёгкую подложку того же
 * оттенка с цветной рамкой, а текст оставляем цветом темы.
 */
export function adaptMermaidStyles(code: string, darkTheme: boolean): string {
	return code.replace(/^(\s*(?:style|classDef)\s+\S+\s+)(.+)$/gm, (line, head: string, rawProps: string) => {
		const props = rawProps.replace(/;\s*$/, "")
		const fill = props.match(/(?:^|,)\s*fill\s*:\s*(#[0-9a-f]{3,6})\b/i)?.[1]
		const luminance = fill ? hexLuminance(fill) : undefined
		if (!fill || luminance === undefined) {
			return line
		}
		if (darkTheme && luminance > 0.55) {
			const hex = fill.length === 4 ? fill.replace(/[0-9a-f]/gi, "$&$&") : fill
			const parts = props
				.split(",")
				.filter((part) => !/^\s*color\s*:/i.test(part))
				.map((part) => (/^\s*fill\s*:/i.test(part) ? `fill:${hex}26` : part))
			if (!/(^|,)\s*stroke\s*:/i.test(props)) {
				parts.push(`stroke:${hex}`)
			}
			return `${head}${parts.join(",")}`
		}
		if (/(^|,)\s*color\s*:/i.test(props)) {
			return line
		}
		const text = luminance > 0.55 ? "#1e1e1e" : "#f3f3f3"
		return `${head}${props},color:${text}`
	})
}
