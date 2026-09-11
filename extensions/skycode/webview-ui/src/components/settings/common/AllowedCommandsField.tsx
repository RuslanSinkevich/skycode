import { useEffect, useRef, useState } from "react"
import { updateAutoApproveSettings } from "@/components/chat/auto-approve-menu/AutoApproveSettingsAPI"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"

interface AllowedCommandsFieldProps {
	/** Wrapper classes, so the field fits the spacing of the section it sits in */
	className?: string
}

/**
 * [SKYCODE] Whitelist of command patterns that run without asking for approval.
 *
 * Shown both in Settings → Permissions (it is an auto-approval rule) and in
 * Settings → Terminal (it is about commands) — same setting, one place to edit
 * it, two places to find it.
 *
 * The textarea keeps its own draft while focused: parsing every keystroke into
 * a list of non-empty lines made it impossible to type a second line, because
 * the fresh empty line was dropped and written back immediately.
 */
const AllowedCommandsField = ({ className = "mt-3" }: AllowedCommandsFieldProps) => {
	const { t } = useI18n()
	const { autoApprovalSettings } = useExtensionState()

	const patterns = autoApprovalSettings.actions.allowedCommandPatterns ?? []
	const [draft, setDraft] = useState(() => patterns.join("\n"))
	const isEditing = useRef(false)

	// Follow external changes (another window, reset) unless the user is typing here
	useEffect(() => {
		if (!isEditing.current) {
			setDraft(patterns.join("\n"))
		}
	}, [patterns])

	const save = async (text: string) => {
		const lines = text
			.split("\n")
			.map((line) => line.trim())
			.filter((line) => line.length > 0)

		const unchanged = lines.length === patterns.length && lines.every((line, i) => line === patterns[i])
		if (unchanged) {
			return
		}

		await updateAutoApproveSettings({
			...autoApprovalSettings,
			version: (autoApprovalSettings.version ?? 1) + 1,
			actions: {
				...autoApprovalSettings.actions,
				allowedCommandPatterns: lines,
			},
		})
	}

	return (
		<div className={className}>
			<div className="text-xs font-medium mb-1">{t("permissions.allowedCommands")}</div>
			<p className="text-xs text-(--vscode-descriptionForeground) mb-2">{t("permissions.allowedCommandsDescription")}</p>
			<textarea
				className="w-full rounded-md text-xs p-2 min-h-[72px] resize-y"
				data-testid="allowed-commands-field"
				onBlur={() => {
					isEditing.current = false
					void save(draft)
				}}
				onChange={(e) => setDraft(e.target.value)}
				onFocus={() => {
					isEditing.current = true
				}}
				placeholder={t("permissions.allowedCommandsPlaceholder")}
				style={{
					background: "var(--vscode-input-background)",
					color: "var(--vscode-input-foreground)",
					border: "1px solid var(--vscode-input-border)",
					fontFamily: "var(--vscode-editor-font-family)",
				}}
				value={draft}
			/>
			<p className="text-xs text-(--vscode-descriptionForeground) mt-1">{t("permissions.allowedCommandsHint")}</p>
		</div>
	)
}

export default AllowedCommandsField
