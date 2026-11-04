import DOMPurify from "dompurify"

// [SKYCODE] Подготовка статичной визуализации (say "visual") к показу в Shadow DOM.

/**
 * [SKYCODE] Чистит CSS модели (текст <style> и атрибут style): без :host-правил, @import, @font-face,
 * внешних url(), position: fixed/sticky и contain — чтобы разметка не вылезла за карточку.
 */
export function sanitizeVisualCss(css: string): string {
	return (
		css
			.replace(/\/\*[\s\S]*?\*\//g, "")
			.replace(/@import[^;{}]*;?/gi, "")
			.replace(/@font-face\s*\{[^{}]*\}/gi, "")
			// Правила, затрагивающие хост (:host, :host(...), :host-context, ::slotted), — целиком
			.replace(/[^{};]*:host[^{}]*\{[^{}]*\}/gi, "")
			.replace(/position\s*:\s*(?:-webkit-)?(?:fixed|sticky)/gi, "position: absolute")
			.replace(/(^|[;{\s])contain\s*:[^;}]*;?/gi, "$1")
			// Внешние ресурсы: оставляем только data: и ссылки на фрагменты (#grad у SVG)
			.replace(/url\(\s*(['"]?)(?!\s*data:|\s*#)[^)]*\)/gi, 'url("")')
	)
}

/** Убирает скрипты, обработчики on*, формы и встраиваемые объекты; SVG разрешён */
export function sanitizeVisualContent(content: string): string {
	// Скрипты и on* убирает DOMPurify; регулярки по сырой строке портили обычный текст ("online = yes")
	const fragment = DOMPurify.sanitize(content, {
		USE_PROFILES: { html: true, svg: true, svgFilters: true },
		ADD_TAGS: ["style"],
		FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "base", "meta", "link"],
		FORBID_ATTR: ["srcdoc"],
		FORCE_BODY: true,
		RETURN_DOM_FRAGMENT: true,
	})
	for (const style of Array.from(fragment.querySelectorAll("style"))) {
		style.textContent = sanitizeVisualCss(style.textContent ?? "")
	}
	for (const el of Array.from(fragment.querySelectorAll("[style]"))) {
		el.setAttribute("style", sanitizeVisualCss(el.getAttribute("style") ?? ""))
	}
	const holder = document.createElement("div")
	holder.appendChild(fragment)
	return holder.innerHTML
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

/**
 * [SKYCODE] Полный документ для вкладки редактора («Развернуть»): те же базовые стили,
 * что в чате, но на всю ширину редактора. Скрипты там выключены самой панелью.
 */
export function buildVisualDocument(content: string, title: string): string {
	const css = VISUAL_CSS.replace(":host { display: block; }", "html, body { margin: 0; background: var(--vscode-editor-background); }")
	const safeTitle = title.replace(/[<>&]/g, "")
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>${css}
.visual-root { padding: 16px 24px; }</style></head><body><div class="visual-root">${sanitizeVisualContent(content)}</div></body></html>`
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

/**
 * [SKYCODE] HTML для буфера обмена «как документ» (Word, Outlook, Excel): стилей из <style>
 * эти программы не видят, поэтому рамки таблиц задаём атрибутами прямо в тегах.
 */
export function buildRichClipboardHtml(content: string): string {
	// Отступы между тегами браузер внутри таблиц игнорирует, а Word делает из них лишнюю
	// пустую ячейку над таблицей и тонкую строку под шапкой — убираем
	const html = sanitizeVisualContent(content)
		.replace(/>\s+</g, "><")
		.trim()
		.replace(/<table(?![^>]*\bborder=)/gi, '<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse"')
		.replace(/<(td|th)(?![^>]*\bstyle=)/gi, '<$1 style="border:1px solid #999;padding:4px 8px;vertical-align:top"')
	return `<html><body>${html}</body></html>`
}
