import type { TabInfo } from "@shared/ExtensionMessage"
import { CheckIcon, ClockIcon, Loader2Icon, PauseIcon } from "lucide-react"
import { useI18n } from "@/i18n"

/** Иконка статуса вкладки (спиннер, точка, галочка, часы, пауза); у idle ничего не рисует. */
export function StatusIcon({ status }: { status: TabInfo["status"] }) {
	const { t } = useI18n()
	if (status === "idle") {
		return null
	}
	const label = t(`tabs.status.${status}`)
	let icon: React.ReactNode
	switch (status) {
		case "running":
			icon = <Loader2Icon className="animate-spin text-(--vscode-focusBorder)" size={12} />
			break
		case "awaiting":
			icon = <span className="inline-block size-2 m-[2px] rounded-full bg-(--vscode-editorWarning-foreground)" />
			break
		case "done":
			icon = <CheckIcon className="text-(--vscode-testing-iconPassed)" size={12} />
			break
		case "queued":
			icon = <ClockIcon className="text-(--vscode-descriptionForeground)" size={12} />
			break
		case "stopped":
			icon = <PauseIcon className="text-(--vscode-descriptionForeground)" size={12} />
			break
		default:
			return null
	}
	return (
		<span aria-label={label} className="shrink-0 flex" role="img" title={label}>
			{icon}
		</span>
	)
}
