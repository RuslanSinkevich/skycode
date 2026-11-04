import { VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import React from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import AllowedCommandsField from "../common/AllowedCommandsField"
import Section from "../Section"
import TerminalOutputLineLimitSlider from "../TerminalOutputLineLimitSlider"
import { updateSetting } from "../utils/settingsHandlers"

interface TerminalSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

// [SKYCODE] Профиль, тайм-аут интеграции оболочки и переиспользование терминала переехали во вкладку «Дополнительно»
export const TerminalSettingsSection: React.FC<TerminalSettingsSectionProps> = ({ renderSectionHeader }) => {
	const { t } = useI18n()
	const { vscodeTerminalExecutionMode } = useExtensionState()

	const handleExecutionModeChange = (event: Event) => {
		const target = event.target as HTMLSelectElement
		const value = target.value === "backgroundExec" ? "backgroundExec" : "vscodeTerminal"
		updateSetting("vscodeTerminalExecutionMode", value)
	}

	return (
		<div>
			{renderSectionHeader("terminal")}
			<Section>
				<div className="mb-5" id="terminal-settings-section">
					<div className="mb-4">
						<label className="font-medium block mb-1" htmlFor="terminal-execution-mode">
							{t("terminal.executionMode")}
						</label>
						<VSCodeDropdown
							className="w-full"
							id="terminal-execution-mode"
							onChange={(event) => handleExecutionModeChange(event as Event)}
							value={vscodeTerminalExecutionMode ?? "vscodeTerminal"}>
							<VSCodeOption value="vscodeTerminal">{t("terminal.executionMode.vscode")}</VSCodeOption>
							<VSCodeOption value="backgroundExec">{t("terminal.executionMode.background")}</VSCodeOption>
						</VSCodeDropdown>
						<p className="text-xs text-[var(--vscode-descriptionForeground)] mt-1">
							{t("terminal.executionModeDescription")}
						</p>
					</div>
					<TerminalOutputLineLimitSlider />

					<AllowedCommandsField className="mt-5" />
				</div>
			</Section>
		</div>
	)
}

export default TerminalSettingsSection
