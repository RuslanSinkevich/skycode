import { ActionMetadata } from "./types"

// [SKYCODE] readFiles and editFiles removed from UI.
// Backend code in autoApprove.ts still handles these settings (dead code for now).
// Reason: files are always auto-read, and edits go through DiffSystem (inline diffs
// with Accept/Reject), so these toggles were non-functional ("пустышки").
// The settings remain in AutoApprovalSettings interface for backward compatibility.
// If we ever need per-file approval back, re-add these entries here.
//
// Removed entries:
//   { id: "readFiles", ... subAction: { id: "readFilesExternally" } }
//   { id: "editFiles", ... subAction: { id: "editFilesExternally" } }

// [SKYCODE] Команды терминала здесь больше не перечисляются: три их режима — это уровни одной
// лестницы, а не независимые галочки, и выбираются они радиокнопками в
// CommandApprovalModeSelector (сопоставление с флагами — в commandApprovalMode.ts).
// Остальные действия разбиты на группы, чтобы в настройках их можно было отделить друг от друга.

/** Действия с файлами. */
export const FILE_ACTIONS: ActionMetadata[] = [
	{
		id: "deleteFiles",
		labelKey: "permissions.deleteFiles",
		shortNameKey: "permissions.deleteFilesShort",
		icon: "codicon-trash",
	},
	{
		id: "editNotebooks",
		labelKey: "permissions.editNotebooks",
		shortNameKey: "permissions.editNotebooksShort",
		icon: "codicon-notebook",
	},
]

/** Внешние инструменты. */
export const TOOL_ACTIONS: ActionMetadata[] = [
	{
		id: "useBrowser",
		labelKey: "permissions.useBrowser",
		shortNameKey: "permissions.useBrowserShort",
		icon: "codicon-globe",
	},
	{
		id: "useMcp",
		labelKey: "permissions.useMcp",
		shortNameKey: "permissions.useMcpShort",
		icon: "codicon-server",
	},
]

/** Все галочки подряд — для мест, где группы не нужны (строка-сводка над полем ввода). */
export const ACTION_METADATA: ActionMetadata[] = [...FILE_ACTIONS, ...TOOL_ACTIONS]

export const NOTIFICATIONS_SETTING: ActionMetadata = {
	id: "enableNotifications",
	labelKey: "permissions.enableNotifications",
	shortNameKey: "permissions.enableNotificationsShort",
	icon: "codicon-bell",
}
