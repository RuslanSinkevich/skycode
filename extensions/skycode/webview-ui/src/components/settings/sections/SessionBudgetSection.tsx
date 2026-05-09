import { VSCodeDropdown, VSCodeOption, VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface SessionBudgetSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

type Mode = "auto" | "strong" | "medium" | "weak" | "custom"

const SessionBudgetSection = ({ renderSectionHeader }: SessionBudgetSectionProps) => {
	const { t } = useI18n()
	const {
		sessionBudgetMode,
		customMaxToolCallsPerTurn,
		customMaxConsecutiveReadOnlyTools,
		customForceCompactAfterSteps,
	} = useExtensionState()

	const mode: Mode = (sessionBudgetMode as Mode) || "auto"
	const isCustom = mode === "custom"

	return (
		<div>
			{renderSectionHeader("sessionBudget")}
			<Section>
				{/* Mode dropdown */}
				<div className="mb-[14px]">
					<label className="block text-sm font-medium mb-1" htmlFor="session-budget-mode">
						{t("sessionBudget.mode")}
					</label>
					<VSCodeDropdown
						className="w-full"
						currentValue={mode}
						id="session-budget-mode"
						onChange={(e: any) => updateSetting("sessionBudgetMode", e.target.currentValue as Mode)}>
						<VSCodeOption value="auto">{t("sessionBudget.modeAuto")}</VSCodeOption>
						<VSCodeOption value="strong">{t("sessionBudget.modeStrong")}</VSCodeOption>
						<VSCodeOption value="medium">{t("sessionBudget.modeMedium")}</VSCodeOption>
						<VSCodeOption value="weak">{t("sessionBudget.modeWeak")}</VSCodeOption>
						<VSCodeOption value="custom">{t("sessionBudget.modeCustom")}</VSCodeOption>
					</VSCodeDropdown>
					<p className="text-xs mt-[4px] text-(--vscode-descriptionForeground)">
						{mode === "auto" && t("sessionBudget.modeAutoDescription")}
						{mode === "strong" && t("sessionBudget.modeStrongDescription")}
						{mode === "medium" && t("sessionBudget.modeMediumDescription")}
						{mode === "weak" && t("sessionBudget.modeWeakDescription")}
						{mode === "custom" && t("sessionBudget.modeCustomDescription")}
					</p>
				</div>

				{/* Custom limits — only when custom is selected */}
				{isCustom && (
					<>
						<div className="mb-[14px]">
							<label className="block text-sm font-medium mb-1" htmlFor="session-budget-tool-calls">
								{t("sessionBudget.maxToolCallsPerTurn")}
							</label>
							<VSCodeTextField
								className="w-full"
								id="session-budget-tool-calls"
								onChange={(e: any) => {
									const n = parseInt(e.target.value, 10)
									if (Number.isFinite(n) && n > 0) {
										updateSetting("customMaxToolCallsPerTurn", n)
									}
								}}
								value={String(customMaxToolCallsPerTurn ?? 80)}
							/>
							<p className="text-xs mt-[4px] text-(--vscode-descriptionForeground)">
								{t("sessionBudget.maxToolCallsPerTurnDescription")}
							</p>
						</div>

						<div className="mb-[14px]">
							<label className="block text-sm font-medium mb-1" htmlFor="session-budget-readonly">
								{t("sessionBudget.maxConsecutiveReadOnly")}
							</label>
							<VSCodeTextField
								className="w-full"
								id="session-budget-readonly"
								onChange={(e: any) => {
									const n = parseInt(e.target.value, 10)
									if (Number.isFinite(n) && n > 0) {
										updateSetting("customMaxConsecutiveReadOnlyTools", n)
									}
								}}
								value={String(customMaxConsecutiveReadOnlyTools ?? 12)}
							/>
							<p className="text-xs mt-[4px] text-(--vscode-descriptionForeground)">
								{t("sessionBudget.maxConsecutiveReadOnlyDescription")}
							</p>
						</div>

						<div>
							<label className="block text-sm font-medium mb-1" htmlFor="session-budget-compact">
								{t("sessionBudget.forceCompactAfterSteps")}
							</label>
							<VSCodeTextField
								className="w-full"
								id="session-budget-compact"
								onChange={(e: any) => {
									const n = parseInt(e.target.value, 10)
									if (Number.isFinite(n) && n > 0) {
										updateSetting("customForceCompactAfterSteps", n)
									}
								}}
								value={String(customForceCompactAfterSteps ?? 40)}
							/>
							<p className="text-xs mt-[4px] text-(--vscode-descriptionForeground)">
								{t("sessionBudget.forceCompactAfterStepsDescription")}
							</p>
						</div>
					</>
				)}

				{/* Tier reference table */}
				<div
					className="mt-5 p-3 rounded-md text-xs"
					style={{ border: "1px solid var(--vscode-widget-border)" }}>
					<div className="font-semibold mb-2">{t("sessionBudget.presetsHeader")}</div>
					<table className="w-full">
						<thead>
							<tr className="text-left text-(--vscode-descriptionForeground)">
								<th className="font-normal py-1">{t("sessionBudget.colTier")}</th>
								<th className="font-normal py-1">{t("sessionBudget.colTools")}</th>
								<th className="font-normal py-1">{t("sessionBudget.colReadOnly")}</th>
								<th className="font-normal py-1">{t("sessionBudget.colCompact")}</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td className="py-1">strong</td>
								<td>{"\u221E"}</td>
								<td>{"\u221E"}</td>
								<td>{"\u221E"}</td>
							</tr>
							<tr>
								<td className="py-1">medium</td>
								<td>80</td>
								<td>12</td>
								<td>40</td>
							</tr>
							<tr>
								<td className="py-1">weak</td>
								<td>25</td>
								<td>6</td>
								<td>15</td>
							</tr>
						</tbody>
					</table>
				</div>
			</Section>
		</div>
	)
}

export default memo(SessionBudgetSection)
