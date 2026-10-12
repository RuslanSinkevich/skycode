import { Button } from "@/components/ui/button"
import { PLATFORM_CONFIG } from "@/config/platform.config"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { StateServiceClient } from "@/services/grpc-client"
import Section from "../Section"

interface DebugSectionProps {
	onResetState: (resetGlobalState?: boolean) => Promise<void>
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

/**
 * Выполнить команду VS Code из webview
 */
const executeVsCodeCommand = (command: string, args?: any[]) => {
	PLATFORM_CONFIG.postMessage({
		type: "executeVsCodeCommand",
		executeVsCodeCommand: { command, args },
	})
}

const DebugSection = ({ onResetState, renderSectionHeader }: DebugSectionProps) => {
	const { t } = useI18n()
	const { setShowWelcome } = useExtensionState()
	return (
		<div>
			{renderSectionHeader("debug")}

			{/* ===== DEV TOOLS: Diff System ===== */}
			<Section>
				{/* allow-any-unicode-next-line */}
				<h4 className="text-sm font-medium mb-2">🔧 Diff System (Dev)</h4>
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => executeVsCodeCommand("skycode.diff.clearAll")} variant="error">
						{t("debug.resetAllDiffs")}
					</Button>
					<Button onClick={() => executeVsCodeCommand("skycode.diff.acceptAllInFile")} variant="secondary">
						{t("debug.acceptAllInFile")}
					</Button>
					<Button onClick={() => executeVsCodeCommand("skycode.diff.rejectAllInFile")} variant="secondary">
						{t("debug.rejectAllInFile")}
					</Button>
				</div>
				<p className="text-xs mt-[5px] text-(--vscode-descriptionForeground)">{t("debug.diffDescription")}</p>
			</Section>

			{/* ===== Extension State ===== */}
			<Section>
				{/* allow-any-unicode-next-line */}
				<h4 className="text-sm font-medium mb-2">📦 Extension State</h4>
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => onResetState()} variant="error">
						{t("debug.resetWorkspaceState")}
					</Button>
					<Button onClick={() => onResetState(true)} variant="error">
						{t("debug.resetGlobalState")}
					</Button>
				</div>
				<p className="text-xs mt-[5px] text-(--vscode-descriptionForeground)">{t("debug.resetStateDescription")}</p>
			</Section>

			{/* ===== Onboarding ===== */}
			<Section>
				<h4 className="text-sm font-medium mb-2">{t("debug.onboardingTitle")}</h4>
				<Button
					onClick={async () =>
						await StateServiceClient.setWelcomeViewCompleted({ value: false })
							.catch(() => {})
							.finally(() => setShowWelcome(true))
					}
					variant="secondary">
					{t("debug.resetOnboarding")}
				</Button>
			</Section>
		</div>
	)
}

export default DebugSection
