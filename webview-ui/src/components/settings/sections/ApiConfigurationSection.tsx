import { UpdateSettingsRequest } from "@shared/proto/skycode/state"
import { Mode, OpenaiReasoningEffort } from "@shared/storage/types"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { StateServiceClient } from "@/services/grpc-client"
import { TabButton } from "../../mcp/configuration/McpConfigurationView"
import AdvancedBlock from "../AdvancedBlock"
import ApiOptions from "../ApiOptions"
import PromptProfileInfo from "../PromptProfileInfo"
import Section from "../Section"
import { normalizeApiConfiguration, syncModeConfigurations } from "../utils/providerUtils"
import { updateSetting } from "../utils/settingsHandlers"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

interface ApiConfigurationSectionProps {
	renderSectionHeader?: (tabId: string) => JSX.Element | null
}

const ApiConfigurationSection = ({ renderSectionHeader }: ApiConfigurationSectionProps) => {
	const { planActSeparateModelsSetting, mode, apiConfiguration, openaiReasoningEffort } = useExtensionState()
	const { t } = useI18n()
	const [currentTab, setCurrentTab] = useState<Mode>(mode)
	const { handleFieldsChange } = useApiConfigurationHandlers()
	// [SKYCODE] Уровень рассуждений влияет только на o-серию OpenAI, поэтому показываем его лишь для openai/openai-native
	const { selectedProvider } = normalizeApiConfiguration(apiConfiguration, planActSeparateModelsSetting ? currentTab : mode)
	const showReasoningEffort = selectedProvider === "openai-native" || selectedProvider === "openai"

	return (
		<div>
			{renderSectionHeader?.("providers")}
			<Section>
				{/* Tabs container */}
				{planActSeparateModelsSetting ? (
					<div className="rounded-md mb-5">
						<div className="flex gap-px mb-[10px] -mt-2 border-0 border-b border-solid border-(--vscode-panel-border)">
							<TabButton
								disabled={currentTab === "plan"}
								isActive={currentTab === "plan"}
								onClick={() => setCurrentTab("plan")}
								style={{
									opacity: 1,
									cursor: "pointer",
								}}>
								{t("apiConfig.planMode")}
							</TabButton>
							<TabButton
								disabled={currentTab === "act"}
								isActive={currentTab === "act"}
								onClick={() => setCurrentTab("act")}
								style={{
									opacity: 1,
									cursor: "pointer",
								}}>
								{t("apiConfig.actMode")}
							</TabButton>
						</div>

						{/* Content container */}
						<div className="-mb-3">
							<ApiOptions currentMode={currentTab} showModelOptions={true} />
						</div>
					</div>
				) : (
					<ApiOptions currentMode={mode} showModelOptions={true} />
				)}

				<AdvancedBlock testId="provider-advanced">
					<PromptProfileInfo />

					{showReasoningEffort && (
						<div>
							<label
								className="block text-sm font-medium text-(--vscode-foreground) mb-1"
								htmlFor="openai-reasoning-effort-dropdown">
								{t("features.openaiReasoningEffort")}
							</label>
							<VSCodeDropdown
								className="w-full"
								currentValue={openaiReasoningEffort || "medium"}
								id="openai-reasoning-effort-dropdown"
								onChange={(e: any) => {
									const newValue = e.target.currentValue as OpenaiReasoningEffort
									updateSetting("openaiReasoningEffort", newValue)
								}}>
								<VSCodeOption value="minimal">{t("features.reasoning.minimal")}</VSCodeOption>
								<VSCodeOption value="low">{t("features.reasoning.low")}</VSCodeOption>
								<VSCodeOption value="medium">{t("features.reasoning.medium")}</VSCodeOption>
								<VSCodeOption value="high">{t("features.reasoning.high")}</VSCodeOption>
							</VSCodeDropdown>
							<p className="text-xs mt-[5px] text-(--vscode-descriptionForeground)">
								{t("features.openaiReasoningEffortDescription")}
							</p>
						</div>
					)}

					<div className="mb-[5px]">
						<VSCodeCheckbox
							checked={planActSeparateModelsSetting}
							className="mb-[5px]"
							onChange={async (e: any) => {
								const checked = e.target.checked === true
								try {
									// If unchecking the toggle, wait a bit for state to update, then sync configurations
									if (!checked) {
										await syncModeConfigurations(apiConfiguration, currentTab, handleFieldsChange)
									}
									await StateServiceClient.updateSettings(
										UpdateSettingsRequest.create({
											planActSeparateModelsSetting: checked,
										}),
									)
								} catch (error) {
									console.error("Failed to update separate models setting:", error)
								}
							}}>
							{t("apiConfig.separateModels")}
						</VSCodeCheckbox>
						<p className="text-xs mt-[5px] text-(--vscode-descriptionForeground)">
							{t("apiConfig.separateModelsDescription")}
						</p>
					</div>
				</AdvancedBlock>
			</Section>
		</div>
	)
}

export default ApiConfigurationSection
