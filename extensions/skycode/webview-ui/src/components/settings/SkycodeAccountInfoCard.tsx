import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"

export const SkycodeAccountInfoCard = () => {
	const { navigateToAccount } = useExtensionState()

	const handleShowAccount = () => {
		navigateToAccount()
	}

	return (
		<div className="max-w-[600px]">
			<VSCodeButton appearance="secondary" onClick={handleShowAccount}>
				Support Skycode
			</VSCodeButton>
		</div>
	)
}
