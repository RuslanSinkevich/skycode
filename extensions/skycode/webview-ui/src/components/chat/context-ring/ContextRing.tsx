import { AskResponseRequest } from "@shared/proto/skycode/task"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { normalizeApiConfiguration } from "@/components/settings/utils/providerUtils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { TaskServiceClient } from "@/services/grpc-client"
import {
	type ContextLevel,
	formatTokens,
	getContextLevel,
	getContextTokens,
	getFillRatio,
	getTokensUntilCompaction,
} from "./contextUsage"

const SIZE = 14
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const POPOVER_WIDTH = 240

const LEVEL_COLOR: Record<ContextLevel, string> = {
	normal: "var(--vscode-focusBorder)",
	warning: "var(--vscode-editorWarning-foreground)",
	critical: "var(--vscode-errorForeground)",
}

interface ContextRingProps {
	/** Агент сейчас выполняет запрос — сжатие недоступно */
	isAiWorking?: boolean
}

/**
 * [SKYCODE] Кольцо заполненности контекста в нижней строке ввода (после названия модели).
 * Клик открывает окошко над кольцом: размер контекста, полоса, остаток до автосжатия, «Сжать сессию».
 * Окошко без крестика, закрывается кликом мимо и Esc.
 */
export function ContextRing({ isAiWorking }: ContextRingProps) {
	const { t } = useI18n()
	const { skycodeMessages, apiConfiguration, mode, contextWindowTokens, autoCompactThresholdTokens } = useExtensionState()
	const [open, setOpen] = useState(false)
	const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)

	const hasTask = (skycodeMessages?.length ?? 0) > 0
	const tokens = useMemo(() => getContextTokens(skycodeMessages ?? []), [skycodeMessages])
	const contextWindow = useMemo(
		() => contextWindowTokens ?? normalizeApiConfiguration(apiConfiguration, mode).selectedModelInfo?.contextWindow ?? 0,
		[contextWindowTokens, apiConfiguration, mode],
	)
	const ratio = getFillRatio(tokens, contextWindow)
	const percent = Math.round(ratio * 100)
	const level = getContextLevel(tokens, autoCompactThresholdTokens, contextWindow)
	const remaining = getTokensUntilCompaction(tokens, autoCompactThresholdTokens)
	const color = LEVEL_COLOR[level]

	const toggle = useCallback(() => {
		const rect = buttonRef.current?.getBoundingClientRect()
		if (rect) {
			const left = Math.max(8, Math.min(rect.left + rect.width / 2 - POPOVER_WIDTH / 2, window.innerWidth - POPOVER_WIDTH - 8))
			setAnchor({ left, bottom: window.innerHeight - rect.top + 6 })
		}
		setOpen((prev) => !prev)
	}, [])

	useEffect(() => {
		if (!open) {
			return
		}
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target as Node
			if (popoverRef.current?.contains(target) || buttonRef.current?.contains(target)) {
				return
			}
			setOpen(false)
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", onMouseDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onMouseDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [open])

	// Ручное сжатие — тот же путь, что у обычной отправки слэш-команды /compact в чат
	const compact = useCallback(async () => {
		setOpen(false)
		try {
			await TaskServiceClient.askResponse(AskResponseRequest.create({ responseType: "messageResponse", text: "/compact" }))
		} catch (error) {
			console.error("[ContextRing] compact failed:", error)
		}
	}, [])

	const title = t("contextRing.tooltip", { percent })
	const compactDisabled = !hasTask || !!isAiWorking

	return (
		<>
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={title}
				className="flex items-center justify-center p-0 m-0 bg-transparent border-0 cursor-pointer"
				data-testid="context-ring-button"
				onClick={toggle}
				ref={buttonRef}
				title={title}
				type="button">
				<svg aria-hidden="true" height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE}>
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						fill="none"
						r={RADIUS}
						stroke="var(--vscode-descriptionForeground)"
						strokeOpacity={0.35}
						strokeWidth={STROKE}
					/>
					<circle
						cx={SIZE / 2}
						cy={SIZE / 2}
						data-testid="context-ring-arc"
						fill="none"
						r={RADIUS}
						stroke={color}
						strokeDasharray={`${CIRCUMFERENCE * ratio} ${CIRCUMFERENCE}`}
						strokeLinecap="round"
						strokeWidth={STROKE}
						transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
					/>
				</svg>
			</button>
			{open && anchor && (
				<div
					className="fixed z-50 rounded-sm p-3 flex flex-col gap-2 text-xs shadow-lg"
					data-testid="context-ring-popover"
					ref={popoverRef}
					role="dialog"
					style={{
						left: anchor.left,
						bottom: anchor.bottom,
						width: POPOVER_WIDTH,
						background: "var(--vscode-editorWidget-background)",
						color: "var(--vscode-editorWidget-foreground, var(--vscode-foreground))",
						border: "1px solid var(--vscode-editorWidget-border, var(--vscode-widget-border))",
					}}>
					<div>
						{t("contextRing.usage", {
							used: formatTokens(tokens),
							total: formatTokens(contextWindow),
							percent,
						})}
					</div>
					<div
						className="h-1 w-full rounded-full overflow-hidden"
						style={{ background: "color-mix(in srgb, var(--vscode-descriptionForeground) 30%, transparent)" }}>
						<div className="h-full" style={{ width: `${percent}%`, background: color }} />
					</div>
					{remaining !== undefined && (
						<div style={{ color: "var(--vscode-descriptionForeground)" }}>
							{remaining > 0
								? t("contextRing.untilCompaction", { tokens: formatTokens(remaining) })
								: t("contextRing.compactionNext")}
						</div>
					)}
					<button
						className="mt-1 px-2 py-1 rounded-sm border-0 cursor-pointer disabled:opacity-50 disabled:cursor-default"
						disabled={compactDisabled}
						onClick={compact}
						style={{
							background: "var(--vscode-button-secondaryBackground)",
							color: "var(--vscode-button-secondaryForeground)",
						}}
						type="button">
						{t("contextRing.compact")}
					</button>
				</div>
			)}
		</>
	)
}
