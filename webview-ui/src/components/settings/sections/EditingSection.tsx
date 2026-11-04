import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface EditingSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const EditingSection = ({ renderSectionHeader }: EditingSectionProps) => {
	const { t } = useI18n()
	const {
		backgroundEditEnabled,
		validateSyntaxBeforeApply,
		blockOnSyntaxErrors,
	} = useExtensionState()

	return (
		<div>
			{renderSectionHeader("editing")}
			<Section>
				<div style={{ marginBottom: 20 }}>
					{/* Background Edit */}
					<div className="mt-2.5">
						<VSCodeCheckbox
							checked={backgroundEditEnabled}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("backgroundEditEnabled", checked)
							}}>
							{t("features.backgroundEdit")}
						</VSCodeCheckbox>
						<p className="text-xs">
							<span className="text-error">{t("features.experimental")}: </span>
							<span className="text-description">{t("features.backgroundEditDescription")}</span>
						</p>
					</div>

					{/* Edit Tools Settings */}
					<div
						className="relative p-3 mt-3 rounded-md"
						style={{
							border: "1px solid var(--vscode-widget-border)",
						}}>
						<div className="font-semibold mb-2">{t("features.editToolsSettings")}</div>

						<VSCodeCheckbox
							checked={validateSyntaxBeforeApply}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("validateSyntaxBeforeApply", checked)
							}}>
							{t("features.validateSyntaxBeforeApply")}
						</VSCodeCheckbox>
						<p className="text-xs text-(--vscode-descriptionForeground) mb-2">
							{t("features.validateSyntaxBeforeApplyDescription")}
						</p>

						<VSCodeCheckbox
							checked={blockOnSyntaxErrors}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("blockOnSyntaxErrors", checked)
							}}>
							{t("features.blockOnSyntaxErrors")}
						</VSCodeCheckbox>
						<p className="text-xs text-(--vscode-descriptionForeground)">
							{t("features.blockOnSyntaxErrorsDescription")}
						</p>
					</div>
				</div>
			</Section>
		</div>
	)
}

export default memo(EditingSection)
