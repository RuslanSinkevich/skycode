import { qwenWebModels } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { VSCodeLink } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { ApiKeyField } from "../common/ApiKeyField"
import { ModelInfoView } from "../common/ModelInfoView"
import { ModelSelector } from "../common/ModelSelector"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

interface QwenWebProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * Qwen Web provider configuration.
 * Uses an unofficial browser-session token from https://chat.qwen.ai
 * (not the official Alibaba API). Free, rate-limited per account.
 */
export const QwenWebProvider = ({ showModelOptions, isPopup, currentMode }: QwenWebProviderProps) => {
	const { t } = useI18n()
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.qwenWebToken || ""}
				onChange={(value) => handleFieldChange("qwenWebToken", value)}
				placeholder={t("provider.qwenWebTokenPlaceholder")}
				providerName="Qwen Web"
				signupUrl="https://chat.qwen.ai"
			/>

			<p
				style={{
					fontSize: "12px",
					color: "var(--vscode-descriptionForeground)",
					marginTop: 8,
				}}>
				{t("provider.qwenWebDescription")}
			</p>
			<VSCodeLink
				href="https://chat.qwen.ai"
				style={{
					color: "var(--vscode-textLink-foreground)",
					marginTop: "4px",
					display: "inline-block",
					fontSize: "12px",
				}}>
				{t("provider.qwenWebOpenChat")}
			</VSCodeLink>

			{showModelOptions && (
				<>
					<ModelSelector
						label={t("provider.model")}
						models={qwenWebModels}
						onChange={(e: any) =>
							handleModeFieldChange(
								{ plan: "planModeApiModelId", act: "actModeApiModelId" },
								e.target.value,
								currentMode,
							)
						}
						selectedModelId={selectedModelId}
					/>

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
