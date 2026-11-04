import { memo, ReactNode } from "react"
import { useI18n } from "@/i18n"
import Section from "../Section"
import AgentBlock from "./advanced/AgentBlock"
import BrowserAdvancedBlock from "./advanced/BrowserAdvancedBlock"
import SessionBudgetBlock from "./advanced/SessionBudgetBlock"
import TerminalAdvancedBlock from "./advanced/TerminalAdvancedBlock"

interface AdvancedSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const GroupHeader = ({ children }: { children: ReactNode }) => (
	<h4 className="text-xs uppercase font-semibold tracking-wide text-(--vscode-descriptionForeground) m-0 pb-1 border-0 border-b border-solid border-(--vscode-panel-border)">
		{children}
	</h4>
)

/**
 * [SKYCODE] Вкладка «Дополнительно»: тонкие настройки, которые обычно менять не нужно.
 * Собирает бывшие вкладки «Бюджет сессии» и «Эксперименты» и редкие поля терминала и браузера.
 */
const AdvancedSection = ({ renderSectionHeader }: AdvancedSectionProps) => {
	const { t } = useI18n()

	return (
		<div>
			{renderSectionHeader("advanced")}
			<Section>
				<p className="text-xs m-0 text-(--vscode-descriptionForeground)">{t("settings.advanced.intro")}</p>

				<div className="flex flex-col gap-3 mt-2" data-testid="advanced-group-sessionBudget">
					<GroupHeader>{t("settings.advanced.group.sessionBudget")}</GroupHeader>
					<SessionBudgetBlock />
				</div>

				<div className="flex flex-col gap-3 mt-4" data-testid="advanced-group-terminal">
					<GroupHeader>{t("settings.advanced.group.terminal")}</GroupHeader>
					<TerminalAdvancedBlock />
				</div>

				<div className="flex flex-col gap-3 mt-4" data-testid="advanced-group-browser">
					<GroupHeader>{t("settings.advanced.group.browser")}</GroupHeader>
					<BrowserAdvancedBlock />
				</div>

				<div className="flex flex-col gap-3 mt-4 mb-5" data-testid="advanced-group-agent">
					<GroupHeader>{t("settings.advanced.group.agent")}</GroupHeader>
					<AgentBlock />
				</div>
			</Section>
		</div>
	)
}

export default memo(AdvancedSection)
