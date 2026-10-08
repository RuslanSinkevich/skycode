import type { UserOrganization } from "@shared/proto/skycode/account"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { type SkycodeUser } from "@/context/SkycodeAuthContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { getSkycodeEnvironmentClassname } from "@/utils/environmentColors"
import { AccountWelcomeView } from "./AccountWelcomeView"

type AccountViewProps = {
	skycodeUser: SkycodeUser | null
	organizations: UserOrganization[] | null
	activeOrganization: UserOrganization | null
	onDone: () => void
}

const AccountView = ({ onDone }: AccountViewProps) => {
	const { t } = useI18n()
	const { environment } = useExtensionState()
	const titleColor = getSkycodeEnvironmentClassname(environment)

	return (
		<div className="fixed inset-0 flex flex-col overflow-hidden pt-[10px] pl-[20px]">
			<div className="flex justify-between items-center mb-[17px] pr-[17px]">
				<h3 className={cn("text-(--vscode-foreground) m-0", titleColor)}>
					{t("account.account")} {environment !== "production" ? ` - ${environment} ${t("account.environment")}` : ""}
				</h3>
				<VSCodeButton onClick={onDone}>{t("account.done")}</VSCodeButton>
			</div>
			<div className="grow overflow-hidden pr-[8px] flex flex-col">
				<div className="h-full mb-1.5">
					<AccountWelcomeView />
				</div>
			</div>
		</div>
	)
}

export default memo(AccountView)
