/**
 * ProcessBlock — контейнер процесса работы AI.
 *
 * Разделён на два сворачиваемых блока:
 *   - ThinkingSection  — рассуждения модели (reasoning + промежуточный текст)
 *     Показывает таймер «Думает 5с…» во время стрима, «Думал 12с» после.
 *   - ExploringSection — вызовы инструментов (read, search, edit, command…)
 *     Показывает локализованное саммари и спиннер на активном инструменте.
 *
 * Каждый блок сворачивается/разворачивается независимо.
 */

import type { SkycodeMessage, SkycodeSayTool } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { BrainIcon, ChevronRightIcon, Loader2Icon, TerminalSquareIcon } from "lucide-react"
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import ErrorRow from "@/components/chat/ErrorRow"
import { cleanPathPrefix } from "@/components/common/CodeAccordian"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { FileServiceClient } from "@/services/grpc-client"
import { getIconByToolName, isLowStakesTool } from "../../utils/messageUtils"

// ==================== Типы ====================

interface ProcessBlockProps {
	messages: SkycodeMessage[]
	isLast?: boolean
	lastModifiedMessage?: SkycodeMessage
	onExpandChange?: (expanded: boolean) => void
	/** Как у ChatRow: держит инкрементальный скролл в конце чата при смене высоты блока (тулы/«думаю»). */
	onHeightChange?: (isTaller: boolean) => void
}

type ToolType = "read" | "edit" | "create" | "delete" | "cmd" | "search" | "web"

interface ToolItemData {
	label: string
	icon: React.ComponentType<{ className?: string }>
	filePath?: string
	isActive: boolean // true = сейчас выполняется (спиннер)
	toolType: ToolType
}

// ==================== Главный компонент ====================

export const ProcessBlock = memo(({ messages, isLast, lastModifiedMessage, onExpandChange, onHeightChange }: ProcessBlockProps) => {
	const { t } = useI18n()
	const isLastBlock = isLast === true
	const rootRef = useRef<HTMLDivElement>(null)
	const prevMeasuredHeightRef = useRef(0)

	// Разделяем сообщения на reasoning и инструменты
	const { reasoningTexts, toolItems, thinkingStartTime } = useMemo(() => {
		const reasoning: string[] = []
		const tools: ToolItemData[] = []
		let firstTs: number | undefined

		for (const msg of messages) {
			// Пропускаем служебные
			if (msg.say === "api_req_started" || msg.say === "checkpoint_created") {
				// Запоминаем самый ранний timestamp для таймера
				if (!firstTs) firstTs = msg.ts
				continue
			}

			// Reasoning — в блок думалки
			if (msg.say === "reasoning" && msg.text) {
				reasoning.push(msg.text)
				if (!firstTs) firstTs = msg.ts
				continue
			}

			// Текст AI для пользователя — пропускаем, он рендерится как отдельный ChatRow
			if (msg.say === "text") {
				continue
			}

			// Инструменты — в блок исследования
			if (isLowStakesTool(msg)) {
				const isCommand = msg.say === "command" || msg.ask === "command"
				if (isCommand) {
					tools.push({
						label: `$ ${(msg.text || "command").substring(0, 80)}`,
						icon: TerminalSquareIcon,
						filePath: undefined,
						isActive: !!msg.partial,
						toolType: "cmd",
					})
				} else {
					const tool = parseToolSafe(msg.text)
					const info = getToolItemInfo(tool, t)
					tools.push({
						label: info.label,
						icon: info.icon,
						filePath: info.filePath,
						isActive: !!msg.partial,
						toolType: info.toolType,
					})
				}
			}
		}

		return {
			reasoningTexts: reasoning,
			toolItems: tools,
			thinkingStartTime: firstTs,
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages, messages.length, messages[messages.length - 1]?.text?.length, messages[messages.length - 1]?.partial])

	const hasReasoning = reasoningTexts.length > 0
	const hasTools = toolItems.length > 0

	/** Reasoning phase: streaming reasoning or waiting for first reasoning token (no tools yet). */
	const isReasoningLive = useMemo(() => {
		if (!isLastBlock) return false
		if (messages.some((m) => m.say === "reasoning" && m.partial === true)) return true
		return (
			messages.some((m) => m.say === "api_req_started") &&
			!hasReasoning &&
			!hasTools
		)
	}, [isLastBlock, messages, hasReasoning, hasTools])

	/** Tool / API phase: open request or a tool/command still streaming. */
	const isExploringLive = useMemo(() => {
		if (!isLastBlock) return false
		if (toolItems.some((item) => item.isActive)) return true
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i]
			if (m.say === "api_req_started" && m.text) {
				try {
					const info = JSON.parse(m.text)
					if (info.cost === undefined) return true
				} catch { /* skip */ }
			}
		}
		return false
	}, [isLastBlock, messages, toolItems])

	// Между api_req_started и первым reasoning / тулом
	const isWaitingForFirstReasoning =
		isLastBlock &&
		messages.some((m) => m.say === "api_req_started") &&
		!hasReasoning &&
		!hasTools

	// Ошибка API: последний блок + lastModifiedMessage = api_req_failed
	const apiErrorMessage = useMemo(() => {
		if (!isLastBlock || !lastModifiedMessage) return undefined
		if (lastModifiedMessage.ask === "api_req_failed") return lastModifiedMessage.text
		return undefined
	}, [isLastBlock, lastModifiedMessage])

	// Streaming error inside api_req_started
	const streamingErrorMessage = useMemo(() => {
		if (!isLastBlock) return undefined
		const lastApiReq = [...messages].reverse().find((m) => m.say === "api_req_started" && m.text)
		if (!lastApiReq?.text) return undefined
		try {
			const info = JSON.parse(lastApiReq.text)
			return info.streamingFailedMessage
		} catch { return undefined }
	}, [isLastBlock, messages])

	const hasError = !!(apiErrorMessage || streamingErrorMessage)

	const isVisible = hasReasoning || hasTools || isWaitingForFirstReasoning || hasError

	useLayoutEffect(() => {
		if (!isVisible || !onHeightChange || !isLastBlock) {
			if (!isVisible) {
				prevMeasuredHeightRef.current = 0
			}
			return
		}
		const el = rootRef.current
		if (!el) {
			return
		}
		let prev = prevMeasuredHeightRef.current
		const ro = new ResizeObserver(() => {
			const h = el.getBoundingClientRect().height
			if (!Number.isFinite(h) || h <= 0) {
				return
			}
			if (prev === 0) {
				prev = h
				prevMeasuredHeightRef.current = h
				return
			}
			if (Math.abs(h - prev) < 1) {
				return
			}
			onHeightChange(h > prev)
			prev = h
			prevMeasuredHeightRef.current = h
		})
		ro.observe(el)
		return () => ro.disconnect()
	}, [isVisible, isLastBlock, onHeightChange])

	if (!isVisible) {
		return null
	}

	// Оба блока видны одновременно → уменьшаем высоту каждого чтобы влезали
	const hasBothSections = (hasReasoning || isWaitingForFirstReasoning) && hasTools

	return (
		<div className="space-y-0.5" ref={rootRef}>
			{/* Блок думалки — reasoning + промежуточный текст */}
			{(hasReasoning || isWaitingForFirstReasoning) && (
				<ThinkingSection
					compact={hasBothSections}
					content={reasoningTexts.join("\n\n")}
					isReasoningLive={isReasoningLive}
					onExpandChange={onExpandChange}
					startTime={thinkingStartTime}
					t={t}
				/>
			)}

			{/* Блок исследования — инструменты */}
			{hasTools && (
				<ExploringSection
					compact={hasBothSections}
					isExploringLive={isExploringLive}
					isLastBlock={isLastBlock}
					items={toolItems}
					onExpandChange={onExpandChange}
					t={t}
				/>
			)}

			{/* Ошибка API */}
			{hasError && (
				<div className="px-4 py-1">
					<ErrorRow
						apiReqStreamingFailedMessage={streamingErrorMessage}
						apiRequestFailedMessage={apiErrorMessage}
						errorType="error"
						message={lastModifiedMessage || messages[messages.length - 1]}
					/>
				</div>
			)}
		</div>
	)
})

ProcessBlock.displayName = "ProcessBlock"

// ==================== ThinkingSection — блок думалки ====================

interface ThinkingSectionProps {
	content: string
	// allow-any-unicode-next-line
	/** True while reasoning is streaming or waiting for first reasoning (before tools). */
	isReasoningLive: boolean
	/** Both sections visible - reduce height so both fit */
	compact: boolean
	startTime?: number
	t: (key: string, params?: Record<string, string | number>) => string
	onExpandChange?: (expanded: boolean) => void
}

/**
 * Блок рассуждений модели.
 * «Думает» только пока идёт стрим reasoning или ожидание первого токена; после этого — «Думал»,
 * даже если запрос к API ещё открыт (инструменты / cost).
 */
const ThinkingSection = memo(({ content, isReasoningLive, compact, startTime, t, onExpandChange }: ThinkingSectionProps) => {
	const scrollRef = useRef<HTMLDivElement>(null)
	const [isExpanded, setIsExpanded] = useState(false)
	const [elapsed, setElapsed] = useState(0)

	// Секунды «думает» без setInterval: rAF, setState только при смене секунды.
	useEffect(() => {
		if (!startTime) {
			return
		}

		const sync = () => setElapsed(Math.floor((Date.now() - startTime) / 1000))
		sync()

		if (!isReasoningLive) {
			return
		}

		let rafId = 0
		let lastSecond = -1
		const loop = () => {
			const s = Math.floor((Date.now() - startTime) / 1000)
			if (s !== lastSecond) {
				lastSecond = s
				setElapsed(s)
			}
			rafId = requestAnimationFrame(loop)
		}
		rafId = requestAnimationFrame(loop)
		return () => cancelAnimationFrame(rafId)
	}, [startTime, isReasoningLive])

	// Автоскролл к низу
	useEffect(() => {
		if (isReasoningLive && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [content, isReasoningLive])

	// Открыт пока идёт reasoning-фаза ИЛИ вручную раскрыт
	const isOpen = isReasoningLive || isExpanded

	const handleToggle = useCallback(() => {
		setIsExpanded((prev) => {
			onExpandChange?.(!prev)
			return !prev
		})
	}, [onExpandChange])

	// Заголовок: «Думает 5с…» или «Думал 12с»
	const title = isReasoningLive
		? `${t("thinking.thinking")}${elapsed > 0 ? ` ${elapsed}${t("thinking.secondsShort")}` : "..."}`
		: `${t("thinking.thoughtFor")} ${elapsed}${t("thinking.secondsShort")}`

	// Высота контента: compact немного меньше, но не в 2 раза
	const maxHeightClass = isReasoningLive
		? compact ? "max-h-[80px]" : "max-h-[100px]"
		: compact ? "max-h-[160px]" : "max-h-[200px]"

	return (
		<div className="px-4 py-0.5">
			<button
				className="flex items-center gap-1.5 text-[12px] text-description opacity-60 hover:opacity-80 cursor-pointer w-full text-left"
				onClick={handleToggle}
				type="button">
				<ChevronRightIcon
					className={cn("size-3 shrink-0 transition-transform duration-150", { "rotate-90": isOpen })}
				/>
				{/* Иконка мозга + анимация пульса пока активен */}
				<BrainIcon className={cn("size-3 shrink-0", { "animate-pulse": isReasoningLive })} />
				<span className="truncate">{title}</span>
			</button>

			{isOpen && content && (
				<div
					className={cn(
						"mt-1 ml-7 overflow-y-auto text-[11px] leading-[18px] text-description opacity-50",
						"whitespace-pre-wrap break-words",
						maxHeightClass,
					)}
					ref={scrollRef}>
					{content}
				</div>
			)}
		</div>
	)
})

ThinkingSection.displayName = "ThinkingSection"

// ==================== ExploringSection — блок исследования ====================

interface ExploringSectionProps {
	items: ToolItemData[]
	/** Open API request or tool/command still in progress */
	isExploringLive: boolean
	/** This ProcessBlock is still the last item in the turn (no newer agent row below yet) */
	isLastBlock: boolean
	/** Both sections visible - reduce height */
	compact: boolean
	t: (key: string, params?: Record<string, string | number>) => string
	onExpandChange?: (expanded: boolean) => void
}

/**
 * Блок инструментов (read, search, edit, command…).
 * Пока блок последний в ходе и идёт работа — список раскрыт; после новой записи агента ниже — сворачивается.
 * userHidden гасит только краткие провалы isExploringLive между тулов в том же ходе.
 */
const ExploringSection = memo(({ items, isExploringLive, isLastBlock, compact, t, onExpandChange }: ExploringSectionProps) => {
	const scrollRef = useRef<HTMLDivElement>(null)
	/** User explicitly collapsed the tool list; ignore brief isExploringLive gaps between tools. */
	const [userHidden, setUserHidden] = useState(false)
	const prevItemCountRef = useRef(items.length)

	useEffect(() => {
		if (items.length > prevItemCountRef.current || isExploringLive) {
			setUserHidden(false)
		}
		prevItemCountRef.current = items.length
	}, [items.length, isExploringLive])

	// Не последний в ходе (уже есть ответ агента ниже) — как раньше, только заголовок; последний — открыт при работе или пока пользователь не свернул (анти-моргание между тулами).
	const isOpen = isLastBlock && (isExploringLive || !userHidden)

	// Автоскролл к низу
	useEffect(() => {
		if (isExploringLive && scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight
		}
	}, [items.length, isExploringLive])

	const handleToggle = useCallback(() => {
		setUserHidden((hidden) => {
			const nextHidden = !hidden
			const listVisible = isLastBlock && (isExploringLive || !nextHidden)
			onExpandChange?.(listVisible)
			return nextHidden
		})
	}, [onExpandChange, isExploringLive, isLastBlock])

	const handleOpenFile = useCallback((filePath: string) => {
		if (!filePath) return
		FileServiceClient.openFileRelativePath(StringRequest.create({ value: filePath })).catch((err) =>
			console.error("Failed to open file:", err),
		)
	}, [])

	// Локализованное саммари: «Исследование: чтение 3, правка 1»
	const summary = useMemo(() => getLocalizedSummary(items, isExploringLive, t), [items, isExploringLive, t])

	// Высота контента: compact → меньше
	const maxHeightClass = isExploringLive
		? compact ? "max-h-[80px]" : "max-h-[100px]"
		: compact ? "max-h-[160px]" : "max-h-[280px]"

	return (
		<div className="px-4 py-0.5">
			<button
				className="flex items-center gap-1.5 text-[12px] text-description opacity-60 hover:opacity-80 cursor-pointer w-full text-left"
				onClick={handleToggle}
				type="button">
				<ChevronRightIcon
					className={cn("size-3 shrink-0 transition-transform duration-150", { "rotate-90": isOpen })}
				/>
				<span className="truncate">{summary}</span>
			</button>

			{isOpen && (
				<div
					className={cn(
						"mt-1 ml-4 overflow-y-auto text-[11px] leading-[18px] text-description opacity-50",
						maxHeightClass,
					)}
					ref={scrollRef}>
					{items.map((item, idx) => (
						<ToolItem
							isActive={item.isActive}
							item={item}
							key={idx}
							onOpenFile={handleOpenFile}
						/>
					))}
				</div>
			)}
		</div>
	)
})

ExploringSection.displayName = "ExploringSection"

// ==================== ToolItem — строка инструмента ====================

const ToolItem = memo(
	({ item, isActive, onOpenFile }: { item: ToolItemData; isActive: boolean; onOpenFile: (path: string) => void }) => {
		const Icon = item.icon

		return (
			<button
				className={cn(
					"flex items-center gap-1.5 py-0.5 min-w-0 w-full text-left bg-transparent border-0 p-0 text-inherit",
					{ "cursor-pointer hover:opacity-80": !!item.filePath },
				)}
				onClick={() => item.filePath && onOpenFile(item.filePath)}
				type="button">
				{/* Спиннер вместо иконки для активного инструмента */}
				{isActive ? (
					<Loader2Icon className="size-3 shrink-0 opacity-70 animate-spin" />
				) : (
					Icon && <Icon className="size-3 shrink-0 opacity-70" />
				)}
				<span className="truncate">{item.label}</span>
			</button>
		)
	},
)

ToolItem.displayName = "ToolItem"

// ==================== Хелперы ====================

/** Локализованное саммари для блока исследования */
function getLocalizedSummary(
	items: ToolItemData[],
	isActive: boolean,
	t: (key: string) => string,
): string {
	// Считаем типы тулов по toolType
	const counts: Record<ToolType, number> = { read: 0, edit: 0, create: 0, delete: 0, cmd: 0, search: 0, web: 0 }

	for (const item of items) {
		counts[item.toolType]++
	}

	const parts: string[] = []
	if (counts.read > 0) parts.push(`${t("process.read")} ${counts.read}`)
	if (counts.edit > 0) parts.push(`${t("process.edited")} ${counts.edit}`)
	if (counts.create > 0) parts.push(`${t("process.created")} ${counts.create}`)
	if (counts.delete > 0) parts.push(`${t("process.deleted")} ${counts.delete}`)
	if (counts.cmd > 0) parts.push(`${t("process.commands")} ${counts.cmd}`)
	if (counts.search > 0) parts.push(`${t("process.search")} ${counts.search}`)
	if (counts.web > 0) parts.push(`${t("process.web")} ${counts.web}`)

	const prefix = isActive ? t("process.exploring") : t("process.explored")

	return parts.length === 0 ? `${prefix}...` : `${prefix}: ${parts.join(", ")}`
}

/** Парсинг JSON тула из текста сообщения */
function parseToolSafe(text: string | undefined): SkycodeSayTool {
	try {
		return JSON.parse(text || "{}") as SkycodeSayTool
	} catch {
		return {} as SkycodeSayTool
	}
}

/** Информация об инструменте для отображения */
function getToolItemInfo(
	tool: SkycodeSayTool,
	t: (key: string) => string,
): {
	label: string
	icon: React.ComponentType<{ className?: string }>
	filePath?: string
	toolType: ToolType
} {
	const icon = getIconByToolName(tool.tool)
	const path = tool.path || ""
	const cleanPath = path ? cleanPathPrefix(path) : ""

	switch (tool.tool) {
		case "readFile":
		case "readDiagnostics":
			return { icon, label: cleanPath || "file", filePath: path, toolType: "read" }
		case "listFilesTopLevel":
		case "listFilesRecursive":
			return { icon, label: `${cleanPath}/`, filePath: path, toolType: "read" }
		case "listCodeDefinitionNames":
			return { icon, label: `${t("tool.definitions")}: ${cleanPath}/`, toolType: "search" }
		case "searchFiles":
			return { icon, label: `${t("tool.search")}: "${tool.regex}" ${cleanPath}/`, toolType: "search" }
		case "glob":
			return { icon, label: `glob: ${cleanPath || tool.content?.substring(0, 60) || "pattern"}`, toolType: "search" }
		case "editedExistingFile":
			return { icon, label: `${t("tool.edited")} ${cleanPath}`, filePath: path, toolType: "edit" }
		case "newFileCreated":
			return { icon, label: `${t("tool.created")} ${cleanPath}`, filePath: path, toolType: "create" }
		case "fileDeleted":
			return { icon, label: `${t("tool.deleted")} ${cleanPath}`, filePath: path, toolType: "delete" }
		case "webSearch":
			return { icon, label: `${t("tool.web")}: ${tool.content?.substring(0, 60) || "search"}`, toolType: "web" }
		case "webFetch":
			return { icon, label: `${t("tool.fetch")}: ${cleanPath || "url"}`, toolType: "web" }
		default:
			return { icon, label: cleanPath || tool.tool || "tool", toolType: "read" }
	}
}
