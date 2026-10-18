import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import SkycodeLogoVariable from "../../assets/SkycodeLogoVariable"

type AboutViewProps = {
	onDone: () => void
}

// [SKYCODE] Экран «О проекте» (бывший «Аккаунт»): описание, автор, версия и блок «Поддержать проект».
const AboutView = ({ onDone }: AboutViewProps) => {
	const { t } = useI18n()
	const { version } = useExtensionState()

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[17px] pr-[17px]">
				<h3 className="text-(--vscode-foreground) m-0">{t("about.title")}</h3>
				<VSCodeButton onClick={onDone}>{t("about.done")}</VSCodeButton>
			</div>
			<div className="grow overflow-y-auto pr-[8px] flex flex-col">
				<div className="flex flex-col items-center pr-3 gap-2.5">
					<SkycodeLogoVariable className="size-16 mb-4" />

					<div className="w-full p-3 rounded-lg text-sm bg-[var(--vscode-editorWidget-background,var(--vscode-editor-background))] border border-[var(--vscode-editorWidget-border,rgba(127,127,127,0.2))]">
						<h4 className="m-0 mb-1.5 text-sm font-semibold text-[var(--vscode-foreground)]">
							Skycode AI{version ? ` v${version}` : ""}
						</h4>
						<p className="m-0 mb-1.5 text-[var(--vscode-foreground)]">{t("about.tagline")}</p>
						<p className="m-0 text-[var(--vscode-descriptionForeground)]">{t("about.author")}</p>
					</div>

					<div className="w-full mt-2 rounded-lg bg-gradient-to-r from-[#2b5ea7] to-[#6b4fbb] p-4 shadow-md">
						<div className="flex flex-col items-center gap-1.5 mb-3">
							<div className="flex items-center gap-2 text-white">
								<span className="codicon codicon-heart-filled text-base" />
								<span className="text-[15px] font-semibold tracking-wide">{t("about.sayThanks")}</span>
							</div>
							<span className="text-[11px] text-white opacity-80 font-normal">{t("about.sayThanksSubtitle")}</span>
						</div>

						<div className="flex gap-2 w-full mb-2">
							{[300, 500, 1000, 5000].map((sum) => (
								<a
									className="flex-1"
									href={`https://yoomoney.ru/quickpay/confirm?receiver=4100117726681107&sum=${sum}&quickpay-form=donate&targets=${encodeURIComponent("Поддержка Skycode AI")}`}
									key={sum}
									rel="noopener noreferrer"
									style={{ textDecoration: "none" }}
									target="_blank">
									<div className="w-full py-2 rounded-md bg-white/20 hover:bg-white/30 text-white text-sm font-semibold text-center cursor-pointer transition-colors">
										{sum} ₽
									</div>
								</a>
							))}
						</div>

						<a
							className="block"
							href="https://boosty.to/skycodeai"
							rel="noopener noreferrer"
							style={{ textDecoration: "none" }}
							target="_blank">
							<div className="text-[11px] text-white/60 hover:text-white/90 text-center cursor-pointer transition-colors mt-1">
								{t("about.orViaBoosty")}
							</div>
						</a>
					</div>

					<a
						className="w-full mb-4"
						href="https://ruslansinkevich.ru/projects/skycode"
						rel="noopener noreferrer"
						style={{ textDecoration: "none" }}
						target="_blank">
						<VSCodeButton className="w-full">{t("about.projectPage")}</VSCodeButton>
					</a>
				</div>
			</div>
		</div>
	)
}

export default memo(AboutView)
