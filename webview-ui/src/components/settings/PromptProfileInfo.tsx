import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"

/**
 * [SKYCODE] Инфо-плашка активного профиля промпта (вариант, тир, лимиты).
 * Раньше жила под выбором провайдера, теперь — в блоке «Дополнительно».
 */
export const PromptProfileInfo = () => {
	const { t } = useI18n()
	const { promptProfile } = useExtensionState()

	if (!promptProfile) {
		return null
	}

	return (
		<div
			style={{
				padding: "6px 10px",
				fontSize: 11,
				borderRadius: 4,
				background: "var(--vscode-textBlockQuote-background)",
				border: "1px solid var(--vscode-textBlockQuote-border)",
				color: "var(--vscode-descriptionForeground)",
			}}>
			<span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{t("provider.promptProfile")}</span>
			<span style={{ marginLeft: 8 }}>
				{t("provider.promptProfileVariant")}:{" "}
				<strong style={{ color: "var(--vscode-foreground)" }}>{promptProfile.variant}</strong>
			</span>
			<span style={{ marginLeft: 12 }}>
				{t("provider.promptProfileTier")}: <strong style={{ color: "var(--vscode-foreground)" }}>{promptProfile.tier}</strong>
			</span>
			<span style={{ marginLeft: 12 }}>
				{promptProfile.maxToolCalls === Infinity ? String.fromCharCode(8734) : promptProfile.maxToolCalls}{" "}
				{t("provider.promptProfileTools")}
			</span>
			{promptProfile.compactEvery !== Infinity && (
				<span style={{ marginLeft: 12 }}>
					{t("provider.promptProfileCompact")} {promptProfile.compactEvery} {t("provider.promptProfileSteps")}
				</span>
			)}
		</div>
	)
}

export default PromptProfileInfo
