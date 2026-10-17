import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CopyButton } from "@/components/common/CopyButton"
import { useI18n } from "@/i18n"
import { buildVisualSrcDoc, parseVisualPayload, readVisualThemeVars } from "./visualSrcDoc"

const MAX_HEIGHT = 600

// [SKYCODE] Карточка статичной визуализации: HTML/SVG в sandbox-iframe без скриптов
export const VisualCard = memo(({ message }: { message: SkycodeMessage }) => {
	const { t } = useI18n()
	const cardRef = useRef<HTMLDivElement>(null)
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [height, setHeight] = useState(120)
	const payload = useMemo(() => parseVisualPayload(message.text), [message.text])
	// Тема читается при монтировании: srcDoc не пересобираем на каждый рендер
	const srcDoc = useMemo(() => (payload ? buildVisualSrcDoc(payload.content, readVisualThemeVars()) : ""), [payload])

	const measure = useCallback(() => {
		const iframe = iframeRef.current
		const doc = iframe?.contentDocument
		if (!iframe || !doc?.documentElement) {
			return
		}
		// Сбрасываем высоту, иначе scrollHeight не уменьшится при сужении колонки
		iframe.style.height = "0px"
		const contentHeight = doc.documentElement.scrollHeight
		iframe.style.height = ""
		setHeight(Math.max(40, Math.min(MAX_HEIGHT, contentHeight)))
	}, [])

	useEffect(() => {
		const card = cardRef.current
		if (!card || typeof ResizeObserver === "undefined") {
			return
		}
		const observer = new ResizeObserver(() => measure())
		observer.observe(card)
		return () => observer.disconnect()
	}, [measure])

	if (!payload) {
		return null
	}

	return (
		<div
			className="rounded-sm border overflow-hidden my-1"
			ref={cardRef}
			style={{ borderColor: "var(--vscode-panel-border)", width: "100%" }}>
			<div
				className="flex items-center justify-between gap-2 px-2 py-1 text-xs"
				style={{ background: "var(--vscode-sideBar-background)", borderBottom: "1px solid var(--vscode-panel-border)" }}>
				<span className="font-medium truncate">{payload.title || t("chat.visual.title")}</span>
				<CopyButton ariaLabel={t("chat.visual.copyHtml")} textToCopy={payload.content} />
			</div>
			<iframe
				onLoad={measure}
				ref={iframeRef}
				sandbox="allow-same-origin"
				srcDoc={srcDoc}
				style={{ width: "100%", height, border: "none", display: "block" }}
				title={payload.title || t("chat.visual.title")}
			/>
		</div>
	)
})

VisualCard.displayName = "VisualCard"
