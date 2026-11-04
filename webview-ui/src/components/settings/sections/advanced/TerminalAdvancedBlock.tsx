import { UpdateTerminalConnectionTimeoutResponse } from "@shared/proto/index.skycode"
import { VSCodeCheckbox, VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { StateServiceClient } from "../../../../services/grpc-client"
import { updateSetting } from "../../utils/settingsHandlers"

/**
 * [SKYCODE] Редкие настройки терминала (бывшие поля вкладки «Терминал»):
 * профиль по умолчанию, тайм-аут интеграции оболочки, переиспользование терминала.
 */
export const TerminalAdvancedBlock = () => {
	const { t } = useI18n()
	const { shellIntegrationTimeout, terminalReuseEnabled, defaultTerminalProfile, availableTerminalProfiles } =
		useExtensionState()

	const [inputValue, setInputValue] = useState((shellIntegrationTimeout / 1000).toString())
	const [inputError, setInputError] = useState<string | null>(null)

	const handleTimeoutChange = (event: Event) => {
		const target = event.target as HTMLInputElement
		const value = target.value

		setInputValue(value)

		const seconds = parseFloat(value)
		if (Number.isNaN(seconds) || seconds <= 0) {
			setInputError(t("terminal.positiveNumber"))
			return
		}

		setInputError(null)
		const timeoutMs = Math.round(seconds * 1000)

		StateServiceClient.updateTerminalConnectionTimeout({ timeoutMs })
			.then((response: UpdateTerminalConnectionTimeoutResponse) => {
				const confirmedMs = response.timeoutMs
				// Backend calls postStateToWebview(), so state will update via subscription
				// Just sync the input value with the confirmed backend value
				if (confirmedMs !== undefined) {
					setInputValue((confirmedMs / 1000).toString())
				}
			})
			.catch((error) => {
				console.error("Failed to update terminal connection timeout:", error)
			})
	}

	const handleInputBlur = () => {
		if (inputError) {
			setInputValue((shellIntegrationTimeout / 1000).toString())
			setInputError(null)
		}
	}

	return (
		<div>
			<div className="mb-4">
				<label className="font-medium block mb-1" htmlFor="default-terminal-profile">
					{t("terminal.defaultProfile")}
				</label>
				<VSCodeDropdown
					className="w-full"
					id="default-terminal-profile"
					onChange={(event: any) =>
						updateSetting("defaultTerminalProfile", (event.target as HTMLSelectElement).value || "default")
					}
					value={defaultTerminalProfile || "default"}>
					{availableTerminalProfiles.map((profile) => (
						<VSCodeOption key={profile.id} title={profile.description} value={profile.id}>
							{profile.name}
						</VSCodeOption>
					))}
				</VSCodeDropdown>
				<p className="text-xs text-(--vscode-descriptionForeground) mt-1">{t("terminal.defaultProfileDescription")}</p>
			</div>

			<div className="mb-4">
				<div className="mb-2">
					<label className="font-medium block mb-1">{t("terminal.shellIntegrationTimeout")}</label>
					<div className="flex items-center">
						<VSCodeTextField
							className="w-full"
							onBlur={handleInputBlur}
							onChange={(event) => handleTimeoutChange(event as Event)}
							placeholder={t("terminal.timeoutPlaceholder")}
							value={inputValue}
						/>
					</div>
					{inputError && <div className="text-(--vscode-errorForeground) text-xs mt-1">{inputError}</div>}
				</div>
				<p className="text-xs text-(--vscode-descriptionForeground)">{t("terminal.timeoutDescription")}</p>
			</div>

			<div>
				<div className="flex items-center mb-2">
					<VSCodeCheckbox
						checked={terminalReuseEnabled ?? true}
						onChange={(event) => updateSetting("terminalReuseEnabled", (event.target as HTMLInputElement).checked)}>
						{t("terminal.reuse")}
					</VSCodeCheckbox>
				</div>
				<p className="text-xs text-(--vscode-descriptionForeground)">{t("terminal.reuseDescription")}</p>
			</div>
		</div>
	)
}

export default TerminalAdvancedBlock
