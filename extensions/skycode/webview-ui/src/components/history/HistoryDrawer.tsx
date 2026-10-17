import type { TabInfo } from "@shared/ExtensionMessage"
import type { HistoryItem } from "@shared/HistoryItem"
import { EmptyRequest, StringArrayRequest, StringRequest } from "@shared/proto/skycode/common"
import { PlusIcon, SearchIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { StatusIcon } from "@/components/chat/tabs/StatusIcon"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { TaskServiceClient } from "@/services/grpc-client"
import { filterHistoryForDrawer, formatRelativeTime, groupHistoryByDate } from "./historyGroups"

const rowClass = "group flex items-center gap-1.5 h-6 px-2 cursor-pointer select-none text-[12px] hover:bg-(--vscode-list-hoverBackground)"
const groupHeaderClass = "px-2 pt-2 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-(--vscode-descriptionForeground)"

/**
 * Шторка истории: выезжает слева поверх чата. Открытые вкладки со статусами, ниже история
 * по датам (без задач, уже открытых во вкладках). Переименования нет: RPC для него в бэкенде нет.
 */
export function HistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { t, locale } = useI18n()
	const { tabs, activeTabId, taskHistory } = useExtensionState()
	const [query, setQuery] = useState("")
	const searchRef = useRef<HTMLInputElement>(null)

	useEffect(() => {
		if (!open) {
			return
		}
		setQuery("")
		searchRef.current?.focus()
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose()
			}
		}
		document.addEventListener("keydown", onKeyDown)
		return () => document.removeEventListener("keydown", onKeyDown)
	}, [open, onClose])

	const needle = query.trim().toLowerCase()
	const getTitle = (tab: TabInfo) => (tab.taskId && tab.title ? tab.title : t("tabs.newTask"))
	const visibleTabs = needle ? tabs.filter((tab) => getTitle(tab).toLowerCase().includes(needle)) : tabs

	const groups = useMemo(() => {
		const openTaskIds = new Set(tabs.map((tab) => tab.taskId).filter(Boolean))
		return groupHistoryByDate(filterHistoryForDrawer(taskHistory, openTaskIds, query), Date.now())
		// biome-ignore lint/correctness/useExhaustiveDependencies: «сейчас» берём при каждом изменении данных, не по таймеру
	}, [taskHistory, tabs, query])

	if (!open) {
		return null
	}

	const switchTab = (id: string) => {
		TaskServiceClient.switchTab(StringRequest.create({ value: id })).catch((err) =>
			console.error("[HistoryDrawer] switchTab failed:", err),
		)
		onClose()
	}
	const newTab = () => {
		TaskServiceClient.newTab(EmptyRequest.create({})).catch((err) => console.error("[HistoryDrawer] newTab failed:", err))
		onClose()
	}
	const openTask = (id: string) => {
		TaskServiceClient.showTaskWithId(StringRequest.create({ value: id })).catch((err) =>
			console.error("[HistoryDrawer] showTaskWithId failed:", err),
		)
		onClose()
	}
	const deleteTask = (id: string) => {
		TaskServiceClient.deleteTasksWithIds(StringArrayRequest.create({ value: [id] })).catch((err) =>
			console.error("[HistoryDrawer] deleteTasksWithIds failed:", err),
		)
	}

	const now = Date.now()
	const isEmpty = visibleTabs.length === 0 && groups.length === 0

	return (
		<div className="fixed inset-0 z-50 flex" data-testid="history-drawer">
			<aside
				aria-label={t("tabs.history")}
				className="flex flex-col h-full w-[75%] min-w-[260px] max-w-[420px] border-r border-(--vscode-panel-border) bg-(--vscode-sideBar-background) text-(--vscode-foreground) shadow-lg">
				<div className="flex items-center gap-1 p-2">
					<div className="flex flex-1 min-w-0 items-center gap-1.5 h-6 px-1.5 rounded-sm border border-(--vscode-input-border,transparent) bg-(--vscode-input-background) focus-within:border-(--vscode-focusBorder)">
						<SearchIcon className="shrink-0 opacity-60" size={12} />
						<input
							className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[12px] text-(--vscode-input-foreground) placeholder:text-(--vscode-input-placeholderForeground)"
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t("historyDrawer.search")}
							ref={searchRef}
							type="text"
							value={query}
						/>
					</div>
					<button
						aria-label={t("historyDrawer.close")}
						className="shrink-0 flex items-center justify-center size-6 rounded-sm bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"
						onClick={onClose}
						title={t("historyDrawer.close")}
						type="button">
						<XIcon size={14} />
					</button>
				</div>

				<button
					className="mx-2 mb-1 flex items-center gap-1.5 h-6 px-2 rounded-sm border-0 cursor-pointer text-[12px] bg-(--vscode-button-secondaryBackground) text-(--vscode-button-secondaryForeground) hover:bg-(--vscode-button-secondaryHoverBackground)"
					onClick={newTab}
					type="button">
					<PlusIcon size={12} />
					{t("historyDrawer.newChat")}
				</button>

				<div className="flex-1 min-h-0 overflow-y-auto pb-2">
					{visibleTabs.length > 0 && (
						<section>
							<div className={groupHeaderClass}>{t("historyDrawer.openTabs")}</div>
							{visibleTabs.map((tab) => {
								const title = getTitle(tab)
								return (
									<div
										className={cn(rowClass, tab.id === activeTabId && "bg-(--vscode-list-activeSelectionBackground)")}
										key={tab.id}
										onClick={() => switchTab(tab.id)}
										onKeyDown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault()
												switchTab(tab.id)
											}
										}}
										role="button"
										tabIndex={0}
										title={title}>
										<StatusIcon status={tab.status} />
										<span className="flex-1 min-w-0 truncate">{title}</span>
									</div>
								)
							})}
						</section>
					)}

					{groups.map((group) => (
						<section key={group.key}>
							<div className={groupHeaderClass}>{t(`historyDrawer.group.${group.key}`)}</div>
							{group.items.map((item: HistoryItem) => (
								<div
									className={rowClass}
									key={item.id}
									onClick={() => openTask(item.id)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault()
											openTask(item.id)
										}
									}}
									role="button"
									tabIndex={0}
									title={item.task}>
									{item.isFavorited && (
										<StarIcon className="shrink-0 fill-(--vscode-button-background) text-(--vscode-button-background)" size={11} />
									)}
									<span className="flex-1 min-w-0 truncate ph-no-capture">{item.task}</span>
									<span className="shrink-0 text-[11px] text-(--vscode-descriptionForeground) group-hover:hidden">
										{formatRelativeTime(item.ts, now, locale)}
									</span>
									{/* Избранное удалять нельзя — как в прежнем экране истории */}
									<button
										aria-label={t("history.delete")}
										className="shrink-0 hidden group-hover:flex items-center justify-center size-5 rounded-sm bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground) disabled:opacity-30 disabled:cursor-default"
										disabled={item.isFavorited}
										onClick={(e) => {
											e.stopPropagation()
											deleteTask(item.id)
										}}
										title={t("history.delete")}
										type="button">
										<Trash2Icon size={12} />
									</button>
								</div>
							))}
						</section>
					))}

					{isEmpty && (
						<div className="px-3 py-4 text-center text-[12px] text-(--vscode-descriptionForeground)">
							{t(needle ? "historyDrawer.noResults" : "historyDrawer.empty")}
						</div>
					)}
				</div>
			</aside>
			<div aria-hidden="true" className="flex-1 bg-black/50" data-testid="history-drawer-backdrop" onClick={onClose} />
		</div>
	)
}

export default HistoryDrawer
