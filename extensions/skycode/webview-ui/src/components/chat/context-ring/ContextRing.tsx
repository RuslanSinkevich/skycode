import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { AskResponseRequest } from "@shared/proto/skycode/task"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { normalizeApiConfiguration } from "@/components/settings/utils/providerUtils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { TaskServiceClient } from "@/services/grpc-client"
import {
	buildBreakdownSegments,
	type ContextLevel,
	formatTokens,
	getDominantCategory,
	getContextLevel,
	getContextTokens,
	getFillRatio,
	getTokensUntilCompaction,
} from "./contextUsage"

const SIZE = 14
const STROKE = 2
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const POPOVER_WIDTH = 260

// [SKYCODE] Цвета категорий разбивки контекста (с запасными значениями вне VS Code)
const CATEGORY_COLOR: Record<string, string> = {
	system: "var(--vscode-charts-blue, #3794ff)",
	files: "var(--vscode-charts-green, #89d185)",
	commands: "var(--vscode-charts-yellow, #cca700)",
	edits: "var(--vscode-charts-orange, #d18616)",
	conversation: "var(--vscode-charts-purple, #b180d7)",
	environment: "var(--vscode-charts-red, #f14c4c)",
	other: "var(--vscode-descriptionForeground)",
}
const categoryColor = (category: string) => CATEGORY_COLOR[category] ?? CATEGORY_COLOR.other
// [SKYCODE] Сжатие безопасно слать только когда агент ждёт обычного ответа; на tool/command это был бы отказ с «/compact» как фидбэком
const COMPACT_ASKS = new Set(["completion_result", "resume_completed_task", "followup", "plan_mode_respond", "resume_task"])
const HINT_CATEGORIES = new Set(["files", "commands", "edits", "conversation"])

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
	const { skycodeMessages, apiConfiguration, mode, contextWindowTokens, autoCompactThresholdTokens, contextBreakdown } =
		useExtensionState()
	const [open, setOpen] = useState(false)
	const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null)
	const buttonRef = useRef<HTMLButtonElement>(null)
	const popoverRef = useRef<HTMLDivElement>(null)

	const hasTask = (skycodeMessages?.length ?? 0) > 0
	// [SKYCODE] Парсим api_req_started только при смене последнего такого сообщения, а не на каждый чанк стрима
	let lastReq: SkycodeMessage | undefined
	for (let i = (skycodeMessages?.length ?? 0) - 1; i >= 0; i--) {
		if (skycodeMessages[i].say === "api_req_started") {
			lastReq = skycodeMessages[i]
			break
		}
	}
	const reqTs = lastReq?.ts
	const reqTextLength = lastReq?.text?.length ?? 0
	// biome-ignore lint/correctness/useExhaustiveDependencies: ключ мемоизации — ts и длина текста последнего запроса
	const tokens = useMemo(() => getContextTokens(skycodeMessages ?? []), [reqTs, reqTextLength])
	const lastMessage = skycodeMessages?.at(-1)
	const pendingAsk = lastMessage?.type === "ask" && !lastMessage.partial ? lastMessage.ask : undefined
	const contextWindow = useMemo(
		() => contextWindowTokens ?? normalizeApiConfiguration(apiConfiguration, mode).selectedModelInfo?.contextWindow ?? 0,
		[contextWindowTokens, apiConfiguration, mode],
	)
	const ratio = getFillRatio(tokens, contextWindow)
	const percent = Math.round(ratio * 100)
	const level = getContextLevel(tokens, autoCompactThresholdTokens, contextWindow)
	const remaining = getTokensUntilCompaction(tokens, autoCompactThresholdTokens)
	const color = LEVEL_COLOR[level]
	const segments = useMemo(() => buildBreakdownSegments(contextBreakdown), [contextBreakdown])
	const dominant = getDominantCategory(segments)
	const hintKey = dominant && HINT_CATEGORIES.has(dominant) ? `contextRing.hint.${dominant}` : undefined

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
			await TaskServiceClient.askResponse(
				AskResponseRequest.create({
					responseType: pendingAsk === "resume_task" ? "yesButtonClicked" : "messageResponse",
					text: "/compact",
				}),
			)
		} catch (error) {
			console.error("[ContextRing] compact failed:", error)
		}
	}, [pendingAsk])

	const title = t("contextRing.tooltip", { percent })
	const compactDisabled = !hasTask || !!isAiWorking || !pendingAsk || !COMPACT_ASKS.has(pendingAsk)

	return (
		<>
			<button
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-label={title}
				className="shrink-0 flex items-center justify-center p-0 m-0 bg-transparent border-0 cursor-pointer"
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
						className="h-1 w-full rounded-full overflow-hidden flex"
						style={{ background: "color-mix(in srgb, var(--vscode-descriptionForeground) 30%, transparent)" }}>
						{segments.length > 0 ? (
							<div className="h-full flex" data-testid="context-ring-segments" style={{ width: `${percent}%` }}>
								{segments.map((segment) => (
									<div
										className="h-full"
										data-testid={`context-ring-segment-${segment.category}`}
										key={segment.category}
										style={{ width: `${segment.width}%`, background: categoryColor(segment.category) }}
									/>
								))}
							</div>
						) : (
							<div className="h-full" style={{ width: `${percent}%`, background: color }} />
						)}
					</div>
					{segments.length > 0 && (
						<div className="flex flex-col gap-1" data-testid="context-ring-breakdown">
							{segments.map((segment) => (
								<div className="flex items-center gap-1.5" key={segment.category}>
									<span
										aria-hidden="true"
										className="shrink-0 rounded-full"
										style={{ width: 8, height: 8, background: categoryColor(segment.category) }}
									/>
									<span className="flex-1 min-w-0 truncate">{t(`contextRing.cat.${segment.category}`)}</span>
									<span style={{ color: "var(--vscode-descriptionForeground)" }}>
										{`${formatTokens(segment.tokens)} · ${segment.percent}%`}
									</span>
								</div>
							))}
						</div>
					)}
					{hintKey && (
						<div data-testid="context-ring-hint" style={{ color: "var(--vscode-editorWarning-foreground)" }}>
							{t(hintKey)}
						</div>
					)}
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
						title={compactDisabled && hasTask ? t("contextRing.compactUnavailable") : undefined}
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
