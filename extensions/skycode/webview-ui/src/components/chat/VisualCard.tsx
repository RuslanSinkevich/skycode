import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { CheckIcon, CodeIcon, CopyIcon, Maximize2Icon, XIcon } from "lucide-react"
import { memo, type RefObject, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useI18n } from "@/i18n"
import { buildRichClipboardHtml, buildVisualShadowHtml, parseVisualPayload } from "./visualSrcDoc"

const MAX_INLINE_HEIGHT = 480

/** Изолированный контейнер: разметка модели живёт в Shadow DOM */
function ShadowContent({ html, hostRef: externalRef }: { html: string; hostRef?: RefObject<HTMLDivElement> }) {
	const ownRef = useRef<HTMLDivElement>(null)
	const hostRef = externalRef ?? ownRef
	useEffect(() => {
		const host = hostRef.current
		if (!host) {
			return
		}
		const root = host.shadowRoot ?? host.attachShadow({ mode: "open" })
		root.innerHTML = html
	}, [html])
	return <div data-testid="visual-content" ref={hostRef} />
}

const iconButtonClass =
	"flex items-center justify-center size-5 rounded-sm bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"

// [SKYCODE] Карточка статичной визуализации: HTML/SVG без скриптов, естественной высоты,
// кнопка «развернуть» — на всю панель поверх чата
export const VisualCard = memo(({ message }: { message: SkycodeMessage }) => {
	const { t } = useI18n()
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState<"rich" | "html" | null>(null)
	const inlineHostRef = useRef<HTMLDivElement>(null)
	const payload = useMemo(() => parseVisualPayload(message.text), [message.text])
	const html = useMemo(() => (payload ? buildVisualShadowHtml(payload.content) : ""), [payload])

	useEffect(() => {
		if (!expanded) {
			return
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setExpanded(false)
			}
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [expanded])

	if (!payload) {
		return null
	}
	const title = payload.title || t("chat.visual.title")

	const flashCopied = (kind: "rich" | "html") => {
		setCopied(kind)
		setTimeout(() => setCopied(null), 1500)
	}
	// Обычное копирование: оформленный HTML для Word/Excel/почты и чистый текст для остального —
	// программа, куда вставляют, сама выбирает формат. Таблица в тексте — через табуляцию (для Excel).
	const copyRich = async () => {
		const root = inlineHostRef.current?.shadowRoot?.querySelector(".visual-root") as HTMLElement | null
		const plain = root?.innerText ?? payload.content
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([buildRichClipboardHtml(payload.content)], { type: "text/html" }),
					"text/plain": new Blob([plain], { type: "text/plain" }),
				}),
			])
		} catch {
			await navigator.clipboard.writeText(plain)
		}
		flashCopied("rich")
	}
	const copyHtml = async () => {
		await navigator.clipboard.writeText(payload.content)
		flashCopied("html")
	}

	return (
		<div className="rounded-sm border border-(--vscode-panel-border) overflow-hidden my-1 w-full">
			<div className="flex items-center justify-between gap-2 px-2 py-1 text-xs bg-(--vscode-sideBar-background) border-b border-(--vscode-panel-border)">
				<span className="font-medium truncate">{title}</span>
				<div className="flex items-center gap-1 shrink-0">
					<button
						aria-label={t("chat.visual.copy")}
						className={iconButtonClass}
						onClick={copyRich}
						title={t("chat.visual.copy")}
						type="button">
						{copied === "rich" ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
					</button>
					<button
						aria-label={t("chat.visual.copyHtml")}
						className={iconButtonClass}
						onClick={copyHtml}
						title={t("chat.visual.copyHtml")}
						type="button">
						{copied === "html" ? <CheckIcon size={12} /> : <CodeIcon size={12} />}
					</button>
					<button
						aria-label={t("chat.visual.expand")}
						className={iconButtonClass}
						onClick={() => setExpanded(true)}
						title={t("chat.visual.expand")}
						type="button">
						<Maximize2Icon size={12} />
					</button>
				</div>
			</div>
			<div className="overflow-auto" style={{ maxHeight: MAX_INLINE_HEIGHT }}>
				<ShadowContent hostRef={inlineHostRef} html={html} />
			</div>
			{expanded &&
				createPortal(
					<div
						className="fixed inset-0 z-50 flex flex-col bg-(--vscode-editor-background)"
						role="dialog"
						aria-label={title}>
						<div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-(--vscode-panel-border) text-sm">
							<span className="font-medium truncate">{title}</span>
							<button
								aria-label={t("chat.visual.close")}
								className={iconButtonClass}
								onClick={() => setExpanded(false)}
								title={t("chat.visual.close")}
								type="button">
								<XIcon size={14} />
							</button>
						</div>
						<div className="flex-1 overflow-auto">
							<ShadowContent html={html} />
						</div>
					</div>,
					document.body,
				)}
		</div>
	)
})

VisualCard.displayName = "VisualCard"
