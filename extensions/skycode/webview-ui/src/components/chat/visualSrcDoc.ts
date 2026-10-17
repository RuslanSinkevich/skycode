import DOMPurify from "dompurify"

// [SKYCODE] Подготовка статичной визуализации (say "visual") к показу в Shadow DOM.

/** Убирает скрипты, обработчики on*, формы и встраиваемые объекты; SVG разрешён */
export function sanitizeVisualContent(content: string): string {
	// Простая подстраховка до DOMPurify: теги script и атрибуты on*
	const stripped = content.replace(/<script[\s\S]*?(<\/script\s*>|$)/gi, "").replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
	return DOMPurify.sanitize(stripped, {
		USE_PROFILES: { html: true, svg: true, svgFilters: true },
		ADD_TAGS: ["style"],
		FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta", "link"],
		FORBID_ATTR: ["srcdoc"],
	})
}

const VISUAL_CSS = `
:host { display: block; }
.visual-root {
	position: relative;
	contain: paint;
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
/* Таблицы — всегда в цветах темы: модели любят светлый фон с серым текстом, в тёмной теме нечитаемо */
table, thead, tbody, tr, th, td { background: transparent !important; color: inherit !important; }
th { font-weight: 600; }
svg { max-width: 100%; height: auto; }
img { max-width: 100%; }
`

/**
 * Разметка для Shadow DOM: стили модели не протекают в интерфейс и наоборот, переменные темы
 * VS Code наследуются сами, высота — естественная. Скрипты не выполнятся: CSP вебвью пускает
 * только скрипты с nonce, а DOMPurify вырезает script и обработчики on*.
 * contain: paint — даже position: fixed из разметки модели не вылезет за карточку.
 */
export function buildVisualShadowHtml(content: string): string {
	return `<style>${VISUAL_CSS}</style><div class="visual-root">${sanitizeVisualContent(content)}</div>`
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
