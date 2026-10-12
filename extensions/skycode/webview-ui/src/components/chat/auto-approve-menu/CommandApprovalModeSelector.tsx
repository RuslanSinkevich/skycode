import { VSCodeRadio } from "@vscode/webview-ui-toolkit/react"
import { memo, useCallback } from "react"
import styled from "styled-components"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { updateAutoApproveSettings } from "./AutoApproveSettingsAPI"
import {
	COMMAND_APPROVAL_MODES,
	type CommandApprovalMode,
	commandActionsForMode,
	getCommandApprovalMode,
} from "./commandApprovalMode"

interface CommandApprovalModeSelectorProps {
	/** Пояснения под вариантами. В компактном меню над полем ввода их прячем — не влезают. */
	showHints?: boolean
}

// Та же обёртка, что у строк с галочками в AutoApproveMenuItem: клик по всей строке.
const OptionRow = styled.div`
	padding: 2px 0.125rem;
	margin: 0;
	width: 100%;
	cursor: pointer;
`

/**
 * [SKYCODE] Выбор ОДНОГО уровня автоодобрения команд вместо трёх независимых галочек.
 * Сопоставление уровня с флагами настроек — в commandApprovalMode.ts.
 */
const CommandApprovalModeSelector = ({ showHints = true }: CommandApprovalModeSelectorProps) => {
	const { t } = useI18n()
	const { autoApprovalSettings } = useExtensionState()
	const currentMode = getCommandApprovalMode(autoApprovalSettings.actions)

	const selectMode = useCallback(
		async (mode: CommandApprovalMode) => {
			if (mode === currentMode) {
				return
			}
			await updateAutoApproveSettings({
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
				actions: { ...autoApprovalSettings.actions, ...commandActionsForMode(mode) },
			})
		},
		[autoApprovalSettings, currentMode],
	)

	return (
		<div className="flex flex-col gap-0.5">
			{COMMAND_APPROVAL_MODES.map((option) => (
				<OptionRow key={option.mode} onClick={() => void selectMode(option.mode)}>
					<VSCodeRadio checked={option.mode === currentMode}>
						<span className="flex items-center gap-2 text-sm text-foreground">
							<span className={`codicon ${option.icon} icon`} />
							<span>{t(option.labelKey)}</span>
						</span>
					</VSCodeRadio>
					{showHints && (
						<div className="text-xs text-(--vscode-descriptionForeground) pl-[26px] leading-snug">
							{t(option.hintKey)}
						</div>
					)}
				</OptionRow>
			))}
		</div>
	)
}

export default memo(CommandApprovalModeSelector)
