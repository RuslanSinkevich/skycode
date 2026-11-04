import { anthropicModels, CLAUDE_SONNET_1M_SUFFIX } from "@shared/api"
import { Mode } from "@shared/storage/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import AnthropicModelCombobox from "../AnthropicModelCombobox"
import { ApiKeyField } from "../common/ApiKeyField"
import { BaseUrlField } from "../common/BaseUrlField"
import { ContextWindowSwitcher } from "../common/ContextWindowSwitcher"
import { ModelInfoView } from "../common/ModelInfoView"
import ThinkingBudgetSlider from "../ThinkingBudgetSlider"
import { normalizeApiConfiguration } from "../utils/providerUtils"
import { useApiConfigurationHandlers } from "../utils/useApiConfigurationHandlers"

// Anthropic models that support thinking/reasoning mode
export const SUPPORTED_ANTHROPIC_THINKING_MODELS = [
	"claude-3-7-sonnet-20250219",
	"claude-sonnet-4-20250514",
	`claude-sonnet-4-20250514${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-opus-4-5-20251101",
	"claude-opus-4-7",
	"claude-opus-4-7-1m",
	"claude-opus-4-20250514",
	"claude-opus-4-1-20250805",
	"claude-sonnet-4-5-20250929",
	`claude-sonnet-4-5-20250929${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-sonnet-4-5@20250929",
	`claude-sonnet-4-5@20250929${CLAUDE_SONNET_1M_SUFFIX}`,
	"claude-haiku-4-5-20251001",
]

/**
 * Props for the AnthropicProvider component
 */
interface AnthropicProviderProps {
	showModelOptions: boolean
	isPopup?: boolean
	currentMode: Mode
}

/**
 * The Anthropic provider configuration component
 */
export const AnthropicProvider = ({ showModelOptions, isPopup, currentMode }: AnthropicProviderProps) => {
	const { t } = useI18n()
	const { apiConfiguration } = useExtensionState()
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	// Get the normalized configuration
	const { selectedModelId, selectedModelInfo } = normalizeApiConfiguration(apiConfiguration, currentMode)

	// Helper function for model switching
	const handleModelChange = (modelId: string) => {
		handleModeFieldChange({ plan: "planModeApiModelId", act: "actModeApiModelId" }, modelId, currentMode)
	}

	return (
		<div>
			<ApiKeyField
				initialValue={apiConfiguration?.apiKey || ""}
				onChange={(value) => handleFieldChange("apiKey", value)}
				providerName="Anthropic"
				signupUrl="https://console.anthropic.com/settings/keys"
			/>

			<BaseUrlField
				initialValue={apiConfiguration?.anthropicBaseUrl}
				label={t("provider.useCustomBaseUrl")}
				onChange={(value) => handleFieldChange("anthropicBaseUrl", value)}
				placeholder={t("provider.defaultAnthropicBaseUrl")}
			/>

			{showModelOptions && (
				<>
					<label className="block mb-1" htmlFor="anthropic-model-search">
						<span className="font-medium">{t("provider.model")}</span>
					</label>
					<AnthropicModelCombobox
						onModelChange={(modelId) =>
							handleModeFieldChange({ plan: "planModeApiModelId", act: "actModeApiModelId" }, modelId, currentMode)
						}
						presetModelIds={Object.keys(anthropicModels)}
						placeholder={t("provider.anthropicModelComboboxPlaceholder")}
						selectedModelId={selectedModelId}
					/>
					<p className="text-xs mt-1 mb-2.5 text-(--vscode-descriptionForeground)">
						{t("provider.anthropicModelIdHint")}
					</p>

					<ContextWindowSwitcher
						base1mModelId="claude-opus-4-7-1m"
						base200kModelId="claude-opus-4-7"
						onModelChange={handleModelChange}
						selectedModelId={selectedModelId}
					/>

					{/* Context window switcher for Claude Sonnet 4.5 */}
					<ContextWindowSwitcher
						base1mModelId={`claude-sonnet-4-5-20250929${CLAUDE_SONNET_1M_SUFFIX}`}
						base200kModelId="claude-sonnet-4-5-20250929"
						onModelChange={handleModelChange}
						selectedModelId={selectedModelId}
					/>

					{/* Same model, id style used by Vertex and some third-party gateways */}
					<ContextWindowSwitcher
						base1mModelId={`claude-sonnet-4-5@20250929${CLAUDE_SONNET_1M_SUFFIX}`}
						base200kModelId="claude-sonnet-4-5@20250929"
						onModelChange={handleModelChange}
						selectedModelId={selectedModelId}
					/>

					{/* Context window switcher for Claude Sonnet 4 */}
					<ContextWindowSwitcher
						base1mModelId={`claude-sonnet-4-20250514${CLAUDE_SONNET_1M_SUFFIX}`}
						base200kModelId="claude-sonnet-4-20250514"
						onModelChange={handleModelChange}
						selectedModelId={selectedModelId}
					/>

					{SUPPORTED_ANTHROPIC_THINKING_MODELS.includes(selectedModelId) && (
						<ThinkingBudgetSlider currentMode={currentMode} maxBudget={selectedModelInfo.thinkingConfig?.maxBudget} />
					)}

					<ModelInfoView isPopup={isPopup} modelInfo={selectedModelInfo} selectedModelId={selectedModelId} />
				</>
			)}
		</div>
	)
}
