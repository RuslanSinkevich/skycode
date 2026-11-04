import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface ContextSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const ContextSection = ({ renderSectionHeader }: ContextSectionProps) => {
	const { t } = useI18n()
	const { useAutoCondense, focusChainSettings } = useExtensionState()

	return (
		<div>
			{renderSectionHeader("context")}
			<Section>
				<div style={{ marginBottom: 20 }}>
					{/* Auto-Condense */}
					<div>
						<VSCodeCheckbox
							checked={useAutoCondense}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("useAutoCondense", checked)
							}}>
							{t("features.autoCondense")}
						</VSCodeCheckbox>
						<p className="text-xs text-(--vscode-descriptionForeground)">{t("features.autoCondenseDescription")}</p>
					</div>

					{/* Focus Chain */}
					<div style={{ marginTop: 10 }}>
						<VSCodeCheckbox
							checked={focusChainSettings?.enabled || false}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("focusChainSettings", { ...focusChainSettings, enabled: checked })
							}}>
							{t("features.focusChain")}
						</VSCodeCheckbox>
						<p className="text-xs text-(--vscode-descriptionForeground)">{t("features.focusChainDescription")}</p>
					</div>
				</div>
			</Section>
		</div>
	)
}

export default memo(ContextSection)
