import { DEFAULT_INDEXING_CONFIG } from "@shared/IndexingTypes"
import { DatabaseZap } from "lucide-react"
import { useCallback } from "react"
import { PLATFORM_CONFIG } from "@/config/platform.config"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { UiServiceClient } from "@/services/grpc-client"

const INDEXING_DOCS_URL = "https://skycode-ai.ru/docs/settings/indexing"

function postIndexingConfigKey(key: string, value: unknown) {
	PLATFORM_CONFIG.postMessage({
		type: "updateIndexingConfig",
		indexingConfigUpdate: { key, value },
	})
}

function dismissIndexingPrompt() {
	PLATFORM_CONFIG.postMessage({ type: "dismissIndexingPrompt" })
}

export const IndexingPromptBanner: React.FC = () => {
	const { t } = useI18n()
	const { indexingConfig, indexingPromptDismissed } = useExtensionState()
	const mode = indexingConfig?.mode ?? DEFAULT_INDEXING_CONFIG.mode

	const handleEnable = useCallback(() => {
		dismissIndexingPrompt()
		postIndexingConfigKey("mode", "local")
	}, [])

	const handleLater = useCallback(() => {
		dismissIndexingPrompt()
	}, [])

	const handleOpenDocs = useCallback(() => {
		UiServiceClient.openUrl({ value: INDEXING_DOCS_URL }).catch(console.error)
	}, [])

	if (mode !== "off" || indexingPromptDismissed) {
		return null
	}

	return (
		<div
			className="mx-5 mb-3 p-4 rounded-lg border shrink-0"
			style={{
				borderColor: "var(--vscode-editorWidget-border, rgba(127,127,127,0.2))",
				backgroundColor: "var(--vscode-editorWidget-background, var(--vscode-editor-background))",
			}}>
			<div className="flex items-start gap-3">
				<DatabaseZap
					className="w-5 h-5 shrink-0 mt-0.5"
					style={{ color: "var(--vscode-progressBar-background)" }}
				/>
				<div className="flex-1 flex flex-col gap-2 min-w-0">
					<h3 className="m-0 text-sm font-semibold">{t("indexing.prompt.title")}</h3>
					<p className="m-0 text-sm text-description leading-relaxed">{t("indexing.prompt.description")}</p>
					<p className="m-0 text-xs" style={{ color: "var(--vscode-editorWarning-foreground)" }}>
						{t("indexing.prompt.cpuWarning")}
					</p>
					<div className="flex flex-wrap gap-2 mt-1">
						<button
							type="button"
							className="px-3 py-1.5 text-xs font-medium rounded cursor-pointer border-none text-[var(--vscode-button-foreground)] bg-[var(--vscode-button-background)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
							onClick={handleEnable}>
							{t("indexing.prompt.enable")}
						</button>
						<button
							type="button"
							className="px-3 py-1.5 text-xs font-medium rounded cursor-pointer border border-[var(--vscode-button-border,var(--vscode-editorWidget-border))] bg-transparent text-[var(--vscode-foreground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
							onClick={handleOpenDocs}>
							{t("indexing.prompt.learnMore")}
						</button>
						<button
							type="button"
							className="px-3 py-1.5 text-xs rounded cursor-pointer border-none bg-transparent text-description hover:text-[var(--vscode-foreground)] transition-colors"
							onClick={handleLater}>
							{t("indexing.prompt.later")}
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}

export default IndexingPromptBanner
