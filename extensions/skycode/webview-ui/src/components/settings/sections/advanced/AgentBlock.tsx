import { VSCodeCheckbox, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { updateSetting } from "../../utils/settingsHandlers"

/**
 * [SKYCODE] Настройки агента: бывшие «Эксперименты» плюс строгий режим планирования и интервал
 * напоминания цепочки фокусировки из вкладки «Контекст». «Параллельный вызов инструментов» из UI убран.
 */
const AgentBlock = () => {
	const { t } = useI18n()
	const { multiRootSetting, skillsEnabled, nativeToolCallSetting, strictPlanModeEnabled, focusChainSettings } =
		useExtensionState()

	return (
		<div className="flex flex-col gap-2.5">
			{/* Strict Plan Mode */}
			<div>
				<VSCodeCheckbox
					checked={strictPlanModeEnabled}
					onChange={(e: any) => {
						const checked = e.target.checked === true
						updateSetting("strictPlanModeEnabled", checked)
					}}>
					{t("features.strictPlanMode")}
				</VSCodeCheckbox>
				<p className="text-xs text-(--vscode-descriptionForeground)">{t("features.strictPlanModeDescription")}</p>
			</div>

			{/* Focus chain reminder interval — как и раньше, только при включённой цепочке фокусировки */}
			{focusChainSettings?.enabled && (
				<div>
					<label
						className="block text-sm font-medium text-(--vscode-foreground) mb-1"
						htmlFor="focus-chain-remind-interval">
						{t("features.focusChainInterval")}
					</label>
					<VSCodeTextField
						className="w-20"
						id="focus-chain-remind-interval"
						onChange={(e: any) => {
							const value = parseInt(e.target.value, 10)
							if (!Number.isNaN(value) && value >= 1 && value <= 100) {
								updateSetting("focusChainSettings", {
									...focusChainSettings,
									remindSkycodeInterval: value,
								})
							}
						}}
						value={String(focusChainSettings?.remindSkycodeInterval || 6)}
					/>
					<p className="text-xs mt-[5px] text-(--vscode-descriptionForeground)">
						{t("features.focusChainIntervalDescription")}
					</p>
				</div>
			)}

			{/* Native Tool Call */}
			<div>
				<VSCodeCheckbox
					checked={nativeToolCallSetting}
					onChange={(e) => {
						const enabled = (e?.target as HTMLInputElement).checked
						updateSetting("nativeToolCallEnabled", enabled)
					}}>
					{t("features.nativeToolCall")}
				</VSCodeCheckbox>
				<p className="text-xs text-(--vscode-descriptionForeground)">{t("features.nativeToolCallDescription")}</p>
			</div>

			{/* Multi-Root */}
			{multiRootSetting.featureFlag && (
				<div>
					<VSCodeCheckbox
						checked={multiRootSetting.user}
						onChange={(e: any) => {
							const checked = e.target.checked === true
							updateSetting("multiRootEnabled", checked)
						}}>
						{t("features.multiRoot")}
					</VSCodeCheckbox>
					<p className="text-xs">
						<span className="text-error">{t("features.experimental")}: </span>{" "}
						<span className="text-description">{t("features.multiRootDescription")}</span>
					</p>
				</div>
			)}

			{/* Skills */}
			<div>
				<VSCodeCheckbox
					checked={skillsEnabled}
					onChange={(e: any) => {
						const checked = e.target.checked === true
						updateSetting("skillsEnabled", checked)
					}}>
					{t("features.skills")}
				</VSCodeCheckbox>
				<p className="text-xs">
					<span className="text-(--vscode-errorForeground)">{t("features.experimental")}: </span>{" "}
					<span className="text-description">{t("features.skillsDescription")}</span>
				</p>
			</div>
		</div>
	)
}

export default memo(AgentBlock)
