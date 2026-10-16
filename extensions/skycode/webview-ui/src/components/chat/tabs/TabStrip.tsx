import type { TabInfo } from "@shared/ExtensionMessage"
import { EmptyRequest, StringRequest } from "@shared/proto/skycode/common"
import { CheckIcon, ChevronDownIcon, ClockIcon, Loader2Icon, PanelLeftIcon, PauseIcon, PlusIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { TaskServiceClient } from "@/services/grpc-client"

// Минимальная ширина вкладки: по ней считаем, сколько вкладок помещается; сами вкладки растягиваются до 150px.
const TAB_MIN_WIDTH = 96
const FIXED_CONTROLS_WIDTH = 8 + 28 + 28 // отступы + кнопка истории + «+»
const OVERFLOW_BUTTON_WIDTH = 56

type ResizeObserverFactory = (callback: () => void) => { observe(el: Element): void; disconnect(): void } | undefined

const defaultObserverFactory: ResizeObserverFactory = (callback) =>
	typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(callback)

const defaultMeasureWidth = (el: HTMLElement) => el.getBoundingClientRect().width

function StatusIcon({ status }: { status: TabInfo["status"] }) {
	const { t } = useI18n()
	if (status === "idle") {
		return null
	}
	const label = t(`tabs.status.${status}`)
	let icon: React.ReactNode
	switch (status) {
		case "running":
			icon = <Loader2Icon className="animate-spin text-(--vscode-focusBorder)" size={12} />
			break
		case "awaiting":
			icon = <span className="inline-block size-2 m-[2px] rounded-full bg-(--vscode-editorWarning-foreground)" />
			break
		case "done":
			icon = <CheckIcon className="text-(--vscode-testing-iconPassed)" size={12} />
			break
		case "queued":
			icon = <ClockIcon className="text-(--vscode-descriptionForeground)" size={12} />
			break
		case "stopped":
			icon = <PauseIcon className="text-(--vscode-descriptionForeground)" size={12} />
			break
		default:
			return null
	}
	return (
		<span aria-label={label} className="shrink-0 flex" role="img" title={label}>
			{icon}
		</span>
	)
}

const iconButtonClass =
	"shrink-0 self-center flex items-center justify-center size-6 rounded-sm bg-transparent border-0 cursor-pointer text-(--vscode-foreground) opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"

/**
 * Полоса вкладок над лентой чата: история, вкладки сессий, «+», переполнение «▾ +N».
 */
export function TabStrip({
	createObserver = defaultObserverFactory,
	measureWidth = defaultMeasureWidth,
}: {
	createObserver?: ResizeObserverFactory
	measureWidth?: (el: HTMLElement) => number
}) {
	const { t } = useI18n()
	const { tabs, activeTabId, navigateToHistory } = useExtensionState()
	const stripRef = useRef<HTMLDivElement>(null)
	const [width, setWidth] = useState<number>(Number.POSITIVE_INFINITY)
	const [menuOpen, setMenuOpen] = useState(false)

	const getTitle = useCallback((tab: TabInfo) => (tab.taskId && tab.title ? tab.title : t("tabs.newTask")), [t])

	useLayoutEffect(() => {
		const el = stripRef.current
		if (!el) {
			return
		}
		const measure = () => {
			const w = measureWidth(el)
			// jsdom и скрытые панели дают 0 — тогда показываем все вкладки
			setWidth(w > 0 ? w : Number.POSITIVE_INFINITY)
		}
		measure()
		const observer = createObserver(measure)
		observer?.observe(el)
		return () => observer?.disconnect()
	}, [createObserver, measureWidth, tabs.length])

	const { visibleTabs, hiddenCount } = useMemo(() => {
		let count = Math.floor((width - FIXED_CONTROLS_WIDTH) / TAB_MIN_WIDTH)
		if (tabs.length > count) {
			count = Math.floor((width - FIXED_CONTROLS_WIDTH - OVERFLOW_BUTTON_WIDTH) / TAB_MIN_WIDTH)
		}
		count = Math.max(1, Math.min(count, tabs.length))
		const visible = tabs.slice(0, count)
		// активная вкладка всегда видна: вытесняет последнюю из помещающихся
		const activeIndex = tabs.findIndex((tab) => tab.id === activeTabId)
		if (activeIndex >= count) {
			visible[count - 1] = tabs[activeIndex]
		}
		return { visibleTabs: visible, hiddenCount: tabs.length - count }
	}, [tabs, activeTabId, width])

	useEffect(() => {
		if (!menuOpen) {
			return
		}
		const onMouseDown = (event: MouseEvent) => {
			if (stripRef.current && !stripRef.current.contains(event.target as Node)) {
				setMenuOpen(false)
			}
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setMenuOpen(false)
			}
		}
		document.addEventListener("mousedown", onMouseDown)
		document.addEventListener("keydown", onKeyDown)
		return () => {
			document.removeEventListener("mousedown", onMouseDown)
			document.removeEventListener("keydown", onKeyDown)
		}
	}, [menuOpen])

	const switchTab = useCallback((id: string) => {
		TaskServiceClient.switchTab(StringRequest.create({ value: id })).catch((err) =>
			console.error("[TabStrip] switchTab failed:", err),
		)
	}, [])
	const closeTab = useCallback((id: string) => {
		TaskServiceClient.closeTab(StringRequest.create({ value: id })).catch((err) =>
			console.error("[TabStrip] closeTab failed:", err),
		)
	}, [])
	const newTab = useCallback(() => {
		TaskServiceClient.newTab(EmptyRequest.create({})).catch((err) => console.error("[TabStrip] newTab failed:", err))
	}, [])

	if (tabs.length === 0) {
		return null
	}

	return (
		<div
			className="relative flex items-end gap-0.5 shrink-0 h-[34px] px-1 pt-1 border-b border-(--vscode-panel-border) bg-(--vscode-editorGroupHeader-tabsBackground,var(--vscode-sideBar-background)) text-[12px]"
			ref={stripRef}>
			<button
				aria-label={t("tabs.history")}
				className={iconButtonClass}
				onClick={navigateToHistory}
				title={t("tabs.history")}
				type="button">
				<PanelLeftIcon size={14} />
			</button>
			<div className="flex flex-1 min-w-0 items-stretch h-full gap-px" role="tablist">
				{visibleTabs.map((tab) => {
					const isActive = tab.id === activeTabId
					const title = getTitle(tab)
					return (
						<div
							aria-selected={isActive}
							className={cn(
								"group relative flex items-center gap-1.5 flex-1 min-w-0 px-2.5 cursor-pointer select-none rounded-t-md border border-b-0 border-transparent border-t-[1.5px]",
								isActive
									? "-mb-px border-x-(--vscode-panel-border) border-t-(--vscode-focusBorder) bg-(--vscode-sideBar-background) text-(--vscode-foreground)"
									: "border-r-(--vscode-panel-border) text-(--vscode-descriptionForeground) hover:bg-(--vscode-toolbar-hoverBackground)",
							)}
							key={tab.id}
							onAuxClick={(e) => {
								if (e.button === 1) {
									e.preventDefault()
									closeTab(tab.id)
								}
							}}
							onClick={() => switchTab(tab.id)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									switchTab(tab.id)
								}
							}}
							onMouseDown={(e) => {
								if (e.button === 1) {
									e.preventDefault()
								}
							}}
							role="tab"
							style={{ maxWidth: 150 }}
							tabIndex={0}
							title={title}>
							<StatusIcon status={tab.status} />
							<span className="flex-1 min-w-0 truncate">{title}</span>
							<button
								aria-label={t("tabs.close")}
								className={cn(
									"shrink-0 flex items-center justify-center size-4 rounded-sm bg-transparent border-0 cursor-pointer text-inherit hover:bg-(--vscode-toolbar-hoverBackground)",
									isActive ? "opacity-80" : "opacity-0 group-hover:opacity-80",
								)}
								onClick={(e) => {
									e.stopPropagation()
									closeTab(tab.id)
								}}
								title={t("tabs.close")}
								type="button">
								<XIcon size={12} />
							</button>
						</div>
					)
				})}
			</div>
			<button aria-label={t("tabs.new")} className={iconButtonClass} onClick={newTab} title={t("tabs.new")} type="button">
				<PlusIcon size={14} />
			</button>
			{hiddenCount > 0 && (
				<button
					aria-expanded={menuOpen}
					aria-label={t("tabs.more")}
					className="shrink-0 self-center flex items-center gap-0.5 h-6 px-1 rounded-sm bg-transparent border-0 cursor-pointer text-(--vscode-foreground) opacity-80 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"
					onClick={() => setMenuOpen((open) => !open)}
					title={t("tabs.more")}
					type="button">
					<ChevronDownIcon size={12} />
					<span>+{hiddenCount}</span>
				</button>
			)}
			{menuOpen && (
				<div
					className="absolute right-1 top-full z-50 mt-0.5 min-w-[180px] max-w-[280px] max-h-[60vh] overflow-y-auto py-0.5 rounded-sm border border-(--vscode-menu-border,var(--vscode-panel-border)) bg-(--vscode-menu-background,var(--vscode-editor-background)) text-(--vscode-menu-foreground,var(--vscode-foreground)) shadow-lg"
					role="menu">
					{tabs.map((tab) => {
						const title = getTitle(tab)
						return (
							<div
								className={cn(
									"flex items-center gap-1.5 px-2 py-1 cursor-pointer hover:bg-(--vscode-menu-selectionBackground,var(--vscode-list-hoverBackground))",
									tab.id === activeTabId && "bg-(--vscode-list-activeSelectionBackground)",
								)}
								key={tab.id}
								onClick={() => {
									setMenuOpen(false)
									switchTab(tab.id)
								}}
								role="menuitem"
								title={title}>
								<StatusIcon status={tab.status} />
								<span className="flex-1 min-w-0 truncate">{title}</span>
							</div>
						)
					})}
				</div>
			)}
		</div>
	)
}

export default TabStrip
