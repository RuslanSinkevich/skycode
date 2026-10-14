import SkycodeLogoSanta from "@/assets/SkycodeLogoSanta"
import SkycodeLogoVariable from "@/assets/SkycodeLogoVariable"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"

const HomeHeader = () => {
	const { t } = useI18n()
	const { environment } = useExtensionState()

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
		</div>
	)
}

export default HomeHeader
