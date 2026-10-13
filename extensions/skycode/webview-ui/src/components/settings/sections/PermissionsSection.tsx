import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { memo } from "react"
import AutoApproveMenuItem from "@/components/chat/auto-approve-menu/AutoApproveMenuItem"
import { updateAutoApproveSettings } from "@/components/chat/auto-approve-menu/AutoApproveSettingsAPI"
import CommandApprovalModeSelector from "@/components/chat/auto-approve-menu/CommandApprovalModeSelector"
import { FILE_ACTIONS, TOOL_ACTIONS } from "@/components/chat/auto-approve-menu/constants"
import type { ActionMetadata } from "@/components/chat/auto-approve-menu/types"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useAutoApproveActions } from "@/hooks/useAutoApproveActions"
import { useI18n } from "@/i18n"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface PermissionsSectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

/** [SKYCODE] Тонкая линия между группами — та же, что уже отделяла уведомления. */
const GroupSeparator = () => (
	<div
		className="my-2"
		style={{
			height: "0.5px",
			background: "var(--vscode-descriptionForeground)",
			opacity: 0.15,
		}}
	/>
)

/** [SKYCODE] Подпись группы: мелко и приглушённо, чтобы не спорить с самими пунктами. */
const GroupTitle = ({ children }: { children: string }) => (
	<div className="text-[11px] uppercase tracking-wide text-(--vscode-descriptionForeground) mb-1">{children}</div>
)

const PermissionsSection = ({ renderSectionHeader }: PermissionsSectionProps) => {
	const { t } = useI18n()
	const { autoApprovalSettings, yoloModeToggled } = useExtensionState()
	const { isChecked, updateAction } = useAutoApproveActions()

	const renderActions = (actions: ActionMetadata[]) => (
		<div className="flex flex-col gap-0.5">
			{actions.map((action) => (
				<AutoApproveMenuItem action={action} isChecked={isChecked} key={action.id} onToggle={updateAction} />
			))}
		</div>
	)

	return (
		<div>
			{renderSectionHeader("permissions")}
			<Section>
				<div style={{ marginBottom: 20 }}>
					{/* Auto-Approve Actions */}
					<div
						className="p-3 mb-3 rounded-md"
						style={{
							border: "1px solid var(--vscode-widget-border)",
						}}>
						<div className="font-semibold mb-2">{t("permissions.actionsSection")}</div>
						<p className="text-xs text-(--vscode-descriptionForeground) mb-3">
							{t("permissions.description")}
						</p>

						{/* [SKYCODE] Команды — выбор одного уровня, а не набор галочек */}
						<GroupTitle>{t("permissions.commandsGroup")}</GroupTitle>
						<CommandApprovalModeSelector />

						<GroupSeparator />
						<GroupTitle>{t("permissions.filesGroup")}</GroupTitle>
						{renderActions(FILE_ACTIONS)}

						<GroupSeparator />
						<GroupTitle>{t("permissions.toolsGroup")}</GroupTitle>
						{renderActions(TOOL_ACTIONS)}

						<GroupSeparator />

						{/* Notifications */}
						<VSCodeCheckbox
							checked={autoApprovalSettings.enableNotifications}
							onChange={async (e: any) => {
								const checked = e.target.checked === true
								await updateAutoApproveSettings({
									...autoApprovalSettings,
									version: (autoApprovalSettings.version ?? 1) + 1,
									enableNotifications: checked,
								})
							}}>
							{t("permissions.enableNotifications")}
						</VSCodeCheckbox>
					</div>

					{/* YOLO Mode */}
					<div
						className="p-3 rounded-md"
						style={{
							border: "1px solid var(--vscode-inputValidation-warningBorder, var(--vscode-widget-border))",
						}}>
						<div className="font-semibold mb-2">{t("permissions.yoloSection")}</div>
						<VSCodeCheckbox
							checked={yoloModeToggled}
							onChange={(e: any) => {
								const checked = e.target.checked === true
								updateSetting("yoloModeToggled", checked)
							}}>
							{t("features.yoloMode")}
						</VSCodeCheckbox>
						<p className="text-xs text-(--vscode-errorForeground) mt-1">{t("features.yoloDanger")}</p>
					</div>
				</div>
			</Section>
		</div>
	)
}

export default memo(PermissionsSection)
