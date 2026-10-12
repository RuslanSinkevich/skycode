import type { AutoApprovalSettings } from "@shared/AutoApprovalSettings"

/**
 * [SKYCODE] Режим автоодобрения команд терминала — один из четырёх уровней.
 *
 * Раньше это были три независимые галочки (безопасные / все / все кроме опасных), хотя по смыслу
 * это ступени одной лестницы: можно было поставить «безопасные» и «все» одновременно, и первая
 * при этом ничего не значила. Теперь в UI выбирается ровно один уровень, а в настройках он
 * по-прежнему хранится тремя булевыми полями — обработчик команд читает именно их.
 */
export type CommandApprovalMode = "ask" | "safe" | "nonDestructive" | "all"

type CommandActions = Pick<
	AutoApprovalSettings["actions"],
	"executeSafeCommands" | "executeNonDestructiveCommands" | "executeAllCommands"
>

export interface CommandApprovalModeOption {
	mode: CommandApprovalMode
	/** Подпись варианта */
	labelKey: string
	/** Пояснение под подписью: что именно будет запускаться без спроса */
	hintKey: string
	/** Короткое имя для строки-сводки над полем ввода; у «ask» его нет — там нечего показывать */
	shortNameKey?: string
	icon: string
}

/** Порядок — от самого строгого к самому свободному. */
export const COMMAND_APPROVAL_MODES: CommandApprovalModeOption[] = [
	{
		mode: "ask",
		labelKey: "permissions.commandMode.ask",
		hintKey: "permissions.commandMode.askHint",
		icon: "codicon-question",
	},
	{
		mode: "safe",
		labelKey: "permissions.commandMode.safe",
		hintKey: "permissions.commandMode.safeHint",
		shortNameKey: "permissions.executeSafeCommandsShort",
		icon: "codicon-terminal",
	},
	{
		mode: "nonDestructive",
		labelKey: "permissions.commandMode.nonDestructive",
		hintKey: "permissions.commandMode.nonDestructiveHint",
		shortNameKey: "permissions.executeNonDestructiveCommandsShort",
		icon: "codicon-shield",
	},
	{
		mode: "all",
		labelKey: "permissions.commandMode.all",
		hintKey: "permissions.commandMode.allHint",
		shortNameKey: "permissions.executeAllCommandsShort",
		icon: "codicon-terminal-bash",
	},
]

/**
 * Текущий уровень по сохранённым флагам.
 *
 * Приоритет совпадает с ExecuteCommandToolHandler (все > кроме опасных > безопасные), поэтому
 * то, что видит пользователь, всегда равно тому, что реально делает обработчик — даже для
 * старых сочетаний флагов, сохранённых до появления этого переключателя.
 */
export function getCommandApprovalMode(actions: CommandActions): CommandApprovalMode {
	if (actions.executeAllCommands) {
		return "all"
	}
	if (actions.executeNonDestructiveCommands) {
		return "nonDestructive"
	}
	if (actions.executeSafeCommands) {
		return "safe"
	}
	return "ask"
}

/**
 * Флаги для выбранного уровня. Пишутся все три сразу, чтобы в настройках не оставалось
 * противоречивых сочетаний. Уровни монотонны: каждый следующий включает предыдущие — так и
 * старый код, знающий только «безопасные», ведёт себя разумно.
 */
export function commandActionsForMode(mode: CommandApprovalMode): Required<CommandActions> {
	return {
		executeSafeCommands: mode !== "ask",
		executeNonDestructiveCommands: mode === "nonDestructive" || mode === "all",
		executeAllCommands: mode === "all",
	}
}
