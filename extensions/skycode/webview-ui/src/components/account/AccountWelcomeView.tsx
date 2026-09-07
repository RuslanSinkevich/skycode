import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import SkycodeLogoVariable from "../../assets/SkycodeLogoVariable"

// export const AccountWelcomeView = () => (
// 	<div className="flex flex-col items-center pr-3 gap-2.5">
// 		<SkycodeLogoWhite className="size-16 mb-4" />
export const AccountWelcomeView = () => {
	const { t } = useI18n()
	const { environment } = useExtensionState()

	return (
		<div className="flex flex-col items-center pr-3 gap-2.5">
			<SkycodeLogoVariable className="size-16 mb-4" environment={environment} />

			<div className="w-full p-3 rounded-lg text-sm bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))] border border-[var(--vscode-editorWidget-border,rgba(127,127,127,0.2))]">
				<div className="flex items-start gap-2.5">
					<span className="text-base leading-none mt-0.5">👋</span>
					<p className="m-0 text-[var(--vscode-foreground)]">
						{t("account.standaloneWelcome")}
					</p>
				</div>
			</div>

			<div className="w-full mt-2 rounded-lg bg-gradient-to-r from-[#2b5ea7] to-[#6b4fbb] p-4 shadow-md">
				<div className="flex flex-col items-center gap-1.5 mb-3">
					<div className="flex items-center gap-2 text-white">
						<span className="codicon codicon-heart-filled text-base" />
						<span className="text-[15px] font-semibold tracking-wide">{t("account.sayThanks")}</span>
					</div>
					<span className="text-[11px] text-white opacity-80 font-normal">{t("account.sayThanksSubtitle")}</span>
				</div>

				<div className="flex gap-2 w-full mb-2">
					{[300, 500, 1000, 5000].map((sum) => (
						<a
							key={sum}
							href={`https://yoomoney.ru/quickpay/confirm?receiver=4100117726681107&sum=${sum}&quickpay-form=donate&targets=${encodeURIComponent("Поддержка Skycode AI")}`}
							target="_blank"
							rel="noopener noreferrer"
							style={{ textDecoration: "none" }}
							className="flex-1">
							<div className="w-full py-2 rounded-md bg-white/20 hover:bg-white/30 text-white text-sm font-semibold text-center cursor-pointer transition-colors">
								{sum} ₽
							</div>
						</a>
					))}
				</div>

				<a
					href="https://boosty.to/skycodeai"
					target="_blank"
					rel="noopener noreferrer"
					style={{ textDecoration: "none" }}
					className="block">
					<div className="text-[11px] text-white/60 hover:text-white/90 text-center cursor-pointer transition-colors mt-1">
						{t("account.orViaBoosty")}
					</div>
				</a>
			</div>

			<a
				href="https://ruslansinkevich.ru/projects/skycode"
				target="_blank"
				rel="noopener noreferrer"
				style={{ textDecoration: "none" }}
				className="w-full mb-4">
				<VSCodeButton className="w-full">{t("account.projectPage")}</VSCodeButton>
			</a>
		</div>
	)
}
