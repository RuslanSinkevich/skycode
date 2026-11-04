import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { CheckIcon, CodeIcon, CopyIcon, Maximize2Icon } from "lucide-react"
import { memo, type RefObject, useEffect, useMemo, useRef, useState } from "react"
import { useI18n } from "@/i18n"
import { FileServiceClient } from "@/services/grpc-client"
import { buildRichClipboardHtml, buildVisualDocument, buildVisualShadowHtml, parseVisualPayload } from "./visualSrcDoc"

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
	// [SKYCODE] Containment на самом хосте (вне shadow root): что бы ни написал CSS модели, наружу не вылезет
		return <div data-testid="visual-content" ref={hostRef} style={{ position: "relative", contain: "content", isolation: "isolate" }} />
}

const iconButtonClass =
	"flex items-center justify-center size-5 rounded-sm bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"

// [SKYCODE] Карточка статичной визуализации: HTML/SVG без скриптов, естественной высоты,
// кнопка «развернуть» — во вкладке редактора, на всю его ширину
export const VisualCard = memo(({ message }: { message: SkycodeMessage }) => {
	const { t } = useI18n()
	const [copied, setCopied] = useState<"rich" | "html" | null>(null)
	const inlineHostRef = useRef<HTMLDivElement>(null)
	const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	// [SKYCODE] Таймер подсветки не должен жить дольше карточки
	useEffect(
		() => () => {
			if (copiedTimerRef.current) {
				clearTimeout(copiedTimerRef.current)
			}
		},
		[],
	)
	const payload = useMemo(() => parseVisualPayload(message.text), [message.text])
	const html = useMemo(() => (payload ? buildVisualShadowHtml(payload.content) : ""), [payload])


	if (!payload) {
		return null
	}
	const title = payload.title || t("chat.visual.title")

	const flashCopied = (kind: "rich" | "html") => {
		setCopied(kind)
		if (copiedTimerRef.current) {
			clearTimeout(copiedTimerRef.current)
		}
		copiedTimerRef.current = setTimeout(() => setCopied(null), 1500)
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
	const openInEditor = () => {
		FileServiceClient.openVisual(
			StringRequest.create({ value: JSON.stringify({ title, html: buildVisualDocument(payload.content, title) }) }),
		).catch((err) => console.error("[VisualCard] openVisual failed:", err))
	}
	const copyHtml = async () => {
		try {
			await navigator.clipboard.writeText(payload.content)
			flashCopied("html")
		} catch (err) {
			console.error("[VisualCard] copyHtml failed:", err)
		}
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
						onClick={openInEditor}
						title={t("chat.visual.expand")}
						type="button">
						<Maximize2Icon size={12} />
					</button>
				</div>
			</div>
			<div className="overflow-auto" style={{ maxHeight: MAX_INLINE_HEIGHT }}>
				<ShadowContent hostRef={inlineHostRef} html={html} />
			</div>
		</div>
	)
})

VisualCard.displayName = "VisualCard"
