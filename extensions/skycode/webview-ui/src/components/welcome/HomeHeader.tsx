import { EmptyRequest } from "@shared/proto/skycode/common"
import SkycodeLogoSanta from "@/assets/SkycodeLogoSanta"
import SkycodeLogoVariable from "@/assets/SkycodeLogoVariable"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { UiServiceClient } from "@/services/grpc-client"

interface HomeHeaderProps {
	shouldShowQuickWins?: boolean
}

const HomeHeader = ({ shouldShowQuickWins = false }: HomeHeaderProps) => {
	const { t } = useI18n()
	const { environment } = useExtensionState()

	const handleTakeATour = async () => {
		try {
			await UiServiceClient.openWalkthrough(EmptyRequest.create())
		} catch (error) {
			console.error("Error opening walkthrough:", error)
		}
	}

	// Check if it's December for festive logo
	const isDecember = new Date().getMonth() === 11 // 11 = December (0-indexed)
	const LogoComponent = isDecember ? SkycodeLogoSanta : SkycodeLogoVariable

	return (
		<div className="flex flex-col items-center mb-5">
			<div className="my-7">
				<LogoComponent className="size-20" environment={environment} />
			</div>
			<div className="text-center flex items-center justify-center px-4">
				<h1 className="m-0 font-bold">{t("welcome.howCanIHelp")}</h1>
			</div>
			{shouldShowQuickWins && (
				<div className="mt-4">
					<button
						className="flex items-center gap-2 px-4 py-2 rounded-full border border-border-panel bg-white/2 hover:bg-list-background-hover transition-colors duration-150 ease-in-out text-code-foreground text-sm font-medium cursor-pointer"
						onClick={handleTakeATour}
						type="button">
						{t("welcome.startTour")}
						<span className="codicon codicon-play scale-90"></span>
					</button>
				</div>
			)}
		</div>
	)
}

export default HomeHeader
