import DOMPurify from "dompurify"

// [SKYCODE] Сборка srcDoc для статичной визуализации (say "visual").
// Скрипты в iframe не исполняются (sandbox без allow-scripts + CSP), здесь — вторая линия защиты.

/** Переменные темы VS Code, которые пробрасываются внутрь iframe */
export const VISUAL_THEME_VARS = [
	"--vscode-foreground",
	"--vscode-editor-background",
	"--vscode-sideBar-background",
	"--vscode-font-family",
	"--vscode-font-size",
	"--vscode-panel-border",
	"--vscode-textLink-foreground",
] as const

export type VisualThemeVars = Partial<Record<(typeof VISUAL_THEME_VARS)[number], string>>

/** Читает вычисленные значения переменных темы с корневого элемента документа */
export function readVisualThemeVars(root: HTMLElement = document.documentElement): VisualThemeVars {
	const style = getComputedStyle(root)
	const result: VisualThemeVars = {}
	for (const name of VISUAL_THEME_VARS) {
		const value = style.getPropertyValue(name).trim()
		if (value) {
			result[name] = value
		}
	}
	return result
}

/** Убирает скрипты, обработчики on*, формы и встраиваемые объекты; SVG разрешён */
export function sanitizeVisualContent(content: string): string {
	// Простая подстраховка до DOMPurify: теги script и атрибуты on*
	const stripped = content.replace(/<script[\s\S]*?(<\/script\s*>|$)/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
	return DOMPurify.sanitize(stripped, {
		USE_PROFILES: { html: true, svg: true, svgFilters: true },
		FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta", "link"],
		FORBID_ATTR: ["srcdoc"],
	})
}

const escapeCssValue = (value: string) => value.replace(/[<>{};]/g, "")

export function buildVisualSrcDoc(content: string, theme: VisualThemeVars = {}): string {
	const vars = Object.entries(theme)
		.filter((entry): entry is [string, string] => !!entry[1])
		.map(([name, value]) => `${name}: ${escapeCssValue(value)};`)
		.join(" ")
	const css = `
:root { ${vars} }
html, body { margin: 0; padding: 0; background: transparent; }
body {
	padding: 8px;
	color: var(--vscode-foreground, #ccc);
	font-family: var(--vscode-font-family, sans-serif);
	font-size: var(--vscode-font-size, 13px);
	line-height: 1.4;
	box-sizing: border-box;
}
a { color: var(--vscode-textLink-foreground, #3794ff); }
table { border-collapse: collapse; }
th, td { border: 1px solid var(--vscode-panel-border, #555); padding: 4px 8px; text-align: left; }
svg { max-width: 100%; height: auto; }
img { max-width: 100%; }
`
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:"><style>${css}</style></head><body>${sanitizeVisualContent(content)}</body></html>`
}

export interface VisualPayload {
	title: string
	content: string
}

/** Разбирает JSON-нагрузку say("visual"); null при ошибке */
export function parseVisualPayload(text: string | undefined): VisualPayload | null {
	try {
		const data = JSON.parse(text || "{}")
		if (typeof data?.content !== "string" || !data.content) {
			return null
		}
		return { title: typeof data.title === "string" ? data.title : "", content: data.content }
	} catch {
		return null
	}
}
