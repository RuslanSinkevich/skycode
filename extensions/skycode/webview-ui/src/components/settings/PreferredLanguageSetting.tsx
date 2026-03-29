import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption } from "@vscode/webview-ui-toolkit/react"
import React from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { updateSetting } from "./utils/settingsHandlers"

const PreferredLanguageSetting: React.FC = () => {
	const { t } = useI18n()
	const { preferredLanguage, alwaysThinkInPreferredLanguage } = useExtensionState()

	const handleLanguageChange = (newLanguage: string) => {
		updateSetting("preferredLanguage", newLanguage)
	}

	const handleThinkInLanguageChange = (e: any) => {
		const checked = e.target.checked === true
		updateSetting("alwaysThinkInPreferredLanguage", checked)
	}

	return (
		<div style={{}}>
			<label className="block mb-1 text-base font-medium" htmlFor="preferred-language-dropdown">
				{t("preferredLanguage.label")}
			</label>
			{/* allow-any-unicode-next-line */}
			<VSCodeDropdown
				// allow-any-unicode-next-line
				currentValue={preferredLanguage || "Russian - Русский"}
				id="preferred-language-dropdown"
				onChange={(e: any) => {
					handleLanguageChange(e.target.value)
				}}
				style={{ width: "100%" }}>
				<VSCodeOption value="English">English</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Arabic - العربية">Arabic - العربية</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Portuguese - Português (Brasil)">Portuguese - Português (Brasil)</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Czech - Čeština">Czech - Čeština</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="French - Français">French - Français</VSCodeOption>
				<VSCodeOption value="German - Deutsch">German - Deutsch</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Hindi - हिन्दी">Hindi - हिन्दी</VSCodeOption>
				<VSCodeOption value="Hungarian - Magyar">Hungarian - Magyar</VSCodeOption>
				<VSCodeOption value="Italian - Italiano">Italian - Italiano</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Japanese - 日本語">Japanese - 日本語</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Korean - 한국어">Korean - 한국어</VSCodeOption>
				<VSCodeOption value="Polish - Polski">Polish - Polski</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Portuguese - Português (Portugal)">Portuguese - Português (Portugal)</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Russian - Русский">Russian - Русский</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Simplified Chinese - 简体中文">Simplified Chinese - 简体中文</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Spanish - Español">Spanish - Español</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Traditional Chinese - 繁體中文">Traditional Chinese - 繁體中文</VSCodeOption>
				{/* allow-any-unicode-next-line */}
				<VSCodeOption value="Turkish - Türkçe">Turkish - Türkçe</VSCodeOption>
			</VSCodeDropdown>
			<p className="text-sm text-description mt-1">{t("preferredLanguage.description")}</p>

			<div className="mt-3">
				<VSCodeCheckbox checked={alwaysThinkInPreferredLanguage || false} onChange={handleThinkInLanguageChange}>
					{t("preferredLanguage.alwaysThink")}
				</VSCodeCheckbox>
				<p className="text-sm text-description mt-1">{t("preferredLanguage.alwaysThinkDescription")}</p>
			</div>
		</div>
	)
}

export default React.memo(PreferredLanguageSetting)
