import { BooleanRequest } from "@shared/proto/skycode/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import SkycodeLogoWhite from "@/assets/SkycodeLogoWhite"
import ApiOptions from "@/components/settings/ApiOptions"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { StateServiceClient } from "@/services/grpc-client"
import { validateApiConfiguration } from "@/utils/validate"

const WelcomeView = memo(() => {
	const { t } = useI18n()
	const { apiConfiguration, mode } = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const [showApiOptions, setShowApiOptions] = useState(false)

	const disableLetsGoButton = apiErrorMessage != null

	const handleSubmit = async () => {
		try {
			await StateServiceClient.setWelcomeViewCompleted(BooleanRequest.create({ value: true }))
		} catch (error) {
			console.error("Failed to update API configuration or complete welcome view:", error)
		}
	}

	useEffect(() => {
		setApiErrorMessage(validateApiConfiguration(mode, apiConfiguration))
	}, [apiConfiguration, mode])

	return (
		<div className="fixed inset-0 p-0 flex flex-col">
			<div className="h-full px-5 overflow-auto flex flex-col gap-2.5">
				<h2 className="text-lg font-semibold">{t("welcome.hiImSkycode")}</h2>
				<div className="flex justify-center my-5">
					<SkycodeLogoWhite className="size-16" />
				</div>
				<p>
					{t("welcome.description")}
				</p>

				<p className="text-(--vscode-descriptionForeground)">
					{t("welcome.apiKeyHint")}
				</p>

			<VSCodeButton appearance="primary" className="w-full mt-1" onClick={() => setShowApiOptions(true)}>
				{t("welcome.getStarted")}
			</VSCodeButton>

				{!showApiOptions && (
					<VSCodeButton
						appearance="secondary"
						className="mt-2.5 w-full"
						onClick={() => setShowApiOptions(!showApiOptions)}>
						{t("welcome.useOwnApiKey")}
					</VSCodeButton>
				)}

				<div className="mt-4.5">
					{showApiOptions && (
						<div>
							<ApiOptions currentMode={mode} showModelOptions={false} />
							<VSCodeButton className="mt-0.75" disabled={disableLetsGoButton} onClick={handleSubmit}>
								Let's go!
							</VSCodeButton>
						</div>
					)}
				</div>
			</div>
		</div>
	)
})

export default WelcomeView
