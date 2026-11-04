import type { TabInfo } from "@shared/ExtensionMessage"
import type { HistoryItem } from "@shared/HistoryItem"
import { EmptyRequest, StringArrayRequest, StringRequest } from "@shared/proto/skycode/common"
import { MessageSquareIcon, PlusIcon, SearchIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { StatusIcon } from "@/components/chat/tabs/StatusIcon"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { TaskServiceClient } from "@/services/grpc-client"
import { displayTaskTitle, filterHistoryForDrawer, formatHistoryTime, groupHistoryByDate } from "./historyGroups"

const rowClass =
	"group flex items-center gap-2 h-7 mx-1.5 px-2 rounded-md cursor-pointer select-none text-[13px] hover:bg-(--vscode-list-hoverBackground) focus-visible:outline focus-visible:outline-1 focus-visible:outline-(--vscode-focusBorder)"
const groupHeaderClass =
	"px-3.5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-(--vscode-descriptionForeground) opacity-80"
const iconButtonClass =
	"shrink-0 flex items-center justify-center size-6 rounded-md bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground)"

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
				className="flex flex-col h-full w-1/2 min-w-[260px] max-w-[420px] border-r border-(--vscode-panel-border) bg-(--vscode-sideBar-background) text-(--vscode-foreground) shadow-2xl animate-in slide-in-from-left duration-150">
				<div className="flex items-center justify-between gap-2 pl-3.5 pr-2 pt-2.5 pb-2">
					<span className="text-[13px] font-semibold">{t("tabs.history")}</span>
					<button
						aria-label={t("historyDrawer.close")}
						className={iconButtonClass}
						onClick={onClose}
						title={t("historyDrawer.close")}
						type="button">
						<XIcon size={14} />
					</button>
				</div>
				<div className="flex flex-col gap-1.5 px-3 pb-3 border-b border-(--vscode-panel-border)">
					<div className="flex items-center gap-2 h-7 px-2 rounded-md border border-(--vscode-input-border,transparent) bg-(--vscode-input-background) focus-within:border-(--vscode-focusBorder)">
						<SearchIcon className="shrink-0 opacity-60" size={13} />
						<input
							className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-(--vscode-input-foreground) placeholder:text-(--vscode-input-placeholderForeground)"
							onChange={(e) => setQuery(e.target.value)}
							placeholder={t("historyDrawer.search")}
							ref={searchRef}
							type="text"
							value={query}
						/>
					</div>
					<button
						className="flex items-center gap-2 h-7 px-2 rounded-md border-0 cursor-pointer text-[13px] bg-transparent text-(--vscode-foreground) hover:bg-(--vscode-list-hoverBackground)"
						onClick={newTab}
						type="button">
						<PlusIcon className="opacity-80" size={14} />
						{t("historyDrawer.newChat")}
					</button>
				</div>

				<div className="flex-1 min-h-0 overflow-y-auto pb-3">
					{visibleTabs.length > 0 && (
						<section>
							<div className={groupHeaderClass}>{t("historyDrawer.openTabs")}</div>
							{visibleTabs.map((tab) => {
								const title = getTitle(tab)
								return (
									<div
										className={cn(
											rowClass,
											tab.id === activeTabId &&
												"bg-(--vscode-list-activeSelectionBackground) text-(--vscode-list-activeSelectionForeground) hover:bg-(--vscode-list-activeSelectionBackground)",
										)}
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
										{tab.status === "idle" ? (
											<MessageSquareIcon className="shrink-0 opacity-50" size={12} />
										) : (
											<StatusIcon status={tab.status} />
										)}
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
									title={displayTaskTitle(item.task, t("historyDrawer.untitled"))}>
									{item.isFavorited ? (
										<StarIcon
											className="shrink-0 fill-(--vscode-button-background) text-(--vscode-button-background)"
											size={12}
										/>
									) : (
										<MessageSquareIcon className="shrink-0 opacity-50" size={12} />
									)}
									<span className="flex-1 min-w-0 truncate ph-no-capture">
										{displayTaskTitle(item.task, t("historyDrawer.untitled"))}
									</span>
									<span className="shrink-0 text-[11px] text-(--vscode-descriptionForeground) group-hover:hidden">
										{formatHistoryTime(item.ts, now, locale)}
									</span>
									{/* Избранное удалять нельзя — как в прежнем экране истории */}
									<button
										aria-label={t("history.delete")}
										className="shrink-0 hidden group-hover:flex items-center justify-center size-5 rounded-md bg-transparent border-0 cursor-pointer text-inherit opacity-70 hover:opacity-100 hover:bg-(--vscode-toolbar-hoverBackground) disabled:opacity-30 disabled:cursor-default"
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
			<div aria-hidden="true" className="flex-1 bg-black/40 animate-in fade-in duration-150" data-testid="history-drawer-backdrop" onClick={onClose} />
		</div>
	)
}

export default HistoryDrawer
