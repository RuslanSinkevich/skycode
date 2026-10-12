import { describe, expect, it } from "vitest"
import {
	COMMAND_APPROVAL_MODES,
	type CommandApprovalMode,
	commandActionsForMode,
	getCommandApprovalMode,
} from "./commandApprovalMode"

// [SKYCODE] Это права доступа: ошибка в сопоставлении молча разрешила бы лишнее.
describe("commandApprovalMode", () => {
	it("каждый уровень после записи читается обратно тем же уровнем", () => {
		for (const { mode } of COMMAND_APPROVAL_MODES) {
			expect(getCommandApprovalMode(commandActionsForMode(mode))).toBe(mode)
		}
	})

	it("пишет флаги, монотонно включающие предыдущие уровни", () => {
		const table: Record<CommandApprovalMode, [boolean, boolean, boolean]> = {
			ask: [false, false, false],
			safe: [true, false, false],
			nonDestructive: [true, true, false],
			all: [true, true, true],
		}
		for (const [mode, [safe, nonDestructive, all]] of Object.entries(table)) {
			expect(commandActionsForMode(mode as CommandApprovalMode)).toEqual({
				executeSafeCommands: safe,
				executeNonDestructiveCommands: nonDestructive,
				executeAllCommands: all,
			})
		}
	})

	it("для старых сочетаний флагов показывает то, что реально делает обработчик", () => {
		// Состояние, в котором пользователь был до переключателя: «безопасные» + «все».
		// Обработчик в таком случае пропускает всё — значит, и показать надо «все».
		expect(getCommandApprovalMode({ executeSafeCommands: true, executeAllCommands: true })).toBe("all")
		// «Все» без «безопасных» — тоже «все»: приоритет у самого свободного уровня.
		expect(getCommandApprovalMode({ executeAllCommands: true })).toBe("all")
		// Ни одного флага (в том числе undefined у новых полей) — спрашивать.
		expect(getCommandApprovalMode({})).toBe("ask")
	})

	it("порядок вариантов — от строгого к свободному", () => {
		expect(COMMAND_APPROVAL_MODES.map((option) => option.mode)).toEqual(["ask", "safe", "nonDestructive", "all"])
	})
})
