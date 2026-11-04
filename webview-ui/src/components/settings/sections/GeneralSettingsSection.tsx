import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { AVAILABLE_LOCALES, type Locale, useI18n } from "@/i18n"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface GeneralSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const GeneralSettingsSection = ({ renderSectionHeader }: GeneralSettingsSectionProps) => {
	const { version, alwaysThinkInPreferredLanguage } = useExtensionState()
	const { locale, setLocale, t } = useI18n()

	return (
		<div>
			{renderSectionHeader("general")}
			<Section>
				{/* Language */}
				<div className="mb-[10px]">
					<div className="mb-[5px] text-sm">{t("general.uiLanguage")}</div>
					<VSCodeDropdown currentValue={locale} onChange={(e: any) => setLocale(e.target.currentValue as Locale)}>
						{AVAILABLE_LOCALES.map((item) => (
							<VSCodeOption key={item.value} value={item.value}>
								{t(item.labelKey)}
							</VSCodeOption>
						))}
					</VSCodeDropdown>
				</div>

				{/* Think in selected language */}
				<div className="mt-[6px]">
					<VSCodeCheckbox
						checked={alwaysThinkInPreferredLanguage || false}
						onChange={(e: any) => {
							updateSetting("alwaysThinkInPreferredLanguage", e.target.checked === true)
						}}>
						{t("preferredLanguage.alwaysThink")}
					</VSCodeCheckbox>
					<p className="text-xs mt-[3px] text-(--vscode-descriptionForeground)">
						{t("preferredLanguage.alwaysThinkDescription")}
					</p>
				</div>

				{/* About */}
				<div
					className="mt-4 p-3 rounded-md"
					style={{
						border: "1px solid var(--vscode-widget-border)",
					}}>
					<h4 className="text-sm font-semibold mb-1">Skycode AI v{version}</h4>
					<p className="text-xs text-description">{t("about.description")}</p>
				</div>
			</Section>
		</div>
	)
}

export default GeneralSettingsSection
