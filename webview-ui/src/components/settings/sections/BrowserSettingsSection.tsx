import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import React from "react"
import { BROWSER_VIEWPORT_PRESETS } from "../../../../../src/shared/BrowserSettings"
import { useExtensionState } from "../../../context/ExtensionStateContext"
import { useI18n } from "../../../i18n"
import CollapsibleContent from "../CollapsibleContent"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface BrowserSettingsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

// [SKYCODE] Удалённое подключение, путь к Chrome и аргументы переехали во вкладку «Дополнительно»
export const BrowserSettingsSection: React.FC<BrowserSettingsSectionProps> = ({ renderSectionHeader }) => {
	const { t } = useI18n()
	const { browserSettings, skycodeWebToolsEnabled } = useExtensionState()

	const handleViewportChange = (event: Event) => {
		const target = event.target as HTMLSelectElement
		const selectedSize = BROWSER_VIEWPORT_PRESETS[target.value as keyof typeof BROWSER_VIEWPORT_PRESETS]
		if (selectedSize) {
			updateSetting("browserSettings", {
				viewport: {
					width: selectedSize.width,
					height: selectedSize.height,
				},
			})
		}
	}

	const isSubSettingsOpen = !(browserSettings.disableToolUse || false)

	return (
		<div>
			{renderSectionHeader("web")}
			<Section>
				<div id="browser-settings-section" style={{ marginBottom: 20 }}>
					{/* Web Tools Toggle */}
					<div style={{ marginBottom: 10 }}>
						<VSCodeCheckbox
							checked={skycodeWebToolsEnabled?.user}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("skycodeWebToolsEnabled", checked)
							}}>
							{t("features.skycodeWebTools")}
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								color: "var(--vscode-descriptionForeground)",
								margin: "4px 0 0 0px",
							}}>
							{t("features.skycodeWebToolsDescription")}
						</p>
						<p
							style={{
								fontSize: "12px",
								color: "var(--vscode-errorForeground)",
								margin: "4px 0 0 0px",
							}}>
							{t("features.skycodeWebToolsWarning")}
						</p>
					</div>

					{/* Master Toggle */}
					<div style={{ marginBottom: isSubSettingsOpen ? 0 : 10 }}>
						<VSCodeCheckbox
							checked={browserSettings.disableToolUse || false}
							onChange={(e) =>
								updateSetting("browserSettings", { disableToolUse: (e.target as HTMLInputElement).checked })
							}>
							{t("browser.disableToolUse")}
						</VSCodeCheckbox>
						<p
							style={{
								fontSize: "12px",
								color: "var(--vscode-descriptionForeground)",
								margin: "4px 0 0 0px",
							}}>
							{t("browser.disableToolUseDescription")}
						</p>
					</div>

					<CollapsibleContent isOpen={isSubSettingsOpen}>
						<div style={{ marginBottom: 15 }}>
							<div style={{ marginBottom: 8 }}>
								<label style={{ fontWeight: "500", display: "block", marginBottom: 5 }}>
									{t("browser.viewport")}
								</label>
								<VSCodeDropdown
									onChange={(event) => handleViewportChange(event as Event)}
									style={{ width: "100%" }}
									value={
										Object.entries(BROWSER_VIEWPORT_PRESETS).find(([_, size]) => {
											const typedSize = size as { width: number; height: number }
											return (
												typedSize.width === browserSettings.viewport.width &&
												typedSize.height === browserSettings.viewport.height
											)
										})?.[0]
									}>
									{Object.entries(BROWSER_VIEWPORT_PRESETS).map(([name]) => (
										<VSCodeOption key={name} value={name}>
											{name}
										</VSCodeOption>
									))}
								</VSCodeDropdown>
							</div>
							<p
								style={{
									fontSize: "12px",
									color: "var(--vscode-descriptionForeground)",
									margin: 0,
								}}>
								{t("browser.viewportDescription")}
							</p>
						</div>
					</CollapsibleContent>
				</div>
			</Section>
		</div>
	)
}

export default BrowserSettingsSection
