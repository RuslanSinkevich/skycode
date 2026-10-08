import { DEFAULT_ALLOWED_COMMAND_PATTERNS } from "@shared/AllowedCommands"
import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { useState } from "react"
import { updateAutoApproveSettings } from "@/components/chat/auto-approve-menu/AutoApproveSettingsAPI"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"

interface AllowedCommandsFieldProps {
	/** Wrapper classes, so the field fits the spacing of the section it sits in */
	className?: string
}

/**
 * [SKYCODE] Commands that run without asking.
 *
 * Two lists, kept apart on purpose: the built-in read-only commands (each one
 * can be switched off) and the patterns the user added by hand (each one can be
 * removed). Mixing them in a single text box made it impossible to tell which
 * was which.
 */
const AllowedCommandsField = ({ className = "mt-3" }: AllowedCommandsFieldProps) => {
	const { t } = useI18n()
	const { autoApprovalSettings } = useExtensionState()
	const [draft, setDraft] = useState("")

	const actions = autoApprovalSettings.actions
	const custom = actions.allowedCommandPatterns ?? []
	const disabledDefaults = actions.disabledDefaultCommandPatterns ?? []
	const enabledDefaultCount = DEFAULT_ALLOWED_COMMAND_PATTERNS.length - disabledDefaults.length

	const save = async (patch: Partial<AutoApprovalSettings["actions"]>) => {
		await updateAutoApproveSettings({
			...autoApprovalSettings,
			version: (autoApprovalSettings.version ?? 1) + 1,
			actions: { ...actions, ...patch },
		})
	}

	const toggleDefault = (pattern: string, enabled: boolean) => {
		const next = enabled ? disabledDefaults.filter((p) => p !== pattern) : [...disabledDefaults, pattern]
		void save({ disabledDefaultCommandPatterns: next })
	}

	const addCustom = () => {
		const pattern = draft.trim()
		if (!pattern || custom.includes(pattern) || DEFAULT_ALLOWED_COMMAND_PATTERNS.includes(pattern)) {
			setDraft("")
			return
		}
		setDraft("")
		void save({ allowedCommandPatterns: [...custom, pattern] })
	}

	const removeCustom = (pattern: string) => {
		void save({ allowedCommandPatterns: custom.filter((p) => p !== pattern) })
	}

	const inputStyle = {
		background: "var(--vscode-input-background)",
		color: "var(--vscode-input-foreground)",
		border: "1px solid var(--vscode-input-border)",
		fontFamily: "var(--vscode-editor-font-family)",
	}

	return (
		<div className={className}>
			<div className="font-medium mb-1">{t("permissions.allowedCommands")}</div>
			<p className="text-xs text-(--vscode-descriptionForeground) mb-3">{t("permissions.allowedCommandsDescription")}</p>

			{/* Built-in, read-only commands */}
			<details className="mb-3 rounded-md p-2" style={{ border: "1px solid var(--vscode-widget-border)" }}>
				<summary className="text-xs cursor-pointer select-none">
					{t("permissions.allowedCommandsDefaults")}{" "}
					<span className="text-(--vscode-descriptionForeground)">
						({enabledDefaultCount}/{DEFAULT_ALLOWED_COMMAND_PATTERNS.length})
					</span>
				</summary>
				<div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
					{DEFAULT_ALLOWED_COMMAND_PATTERNS.map((pattern) => (
						<label className="flex items-center gap-1.5 text-xs cursor-pointer" key={pattern}>
							<input
								checked={!disabledDefaults.includes(pattern)}
								onChange={(e) => toggleDefault(pattern, e.target.checked)}
								type="checkbox"
							/>
							<code className="break-all">{pattern}</code>
						</label>
					))}
				</div>
			</details>

			{/* Patterns the user added */}
			<div className="text-xs font-medium mb-1">{t("permissions.allowedCommandsCustom")}</div>
			{custom.length === 0 ? (
				<p className="text-xs text-(--vscode-descriptionForeground) mb-2">{t("permissions.allowedCommandsEmpty")}</p>
			) : (
				<ul className="list-none p-0 m-0 mb-2 flex flex-col gap-1" data-testid="allowed-commands-list">
					{custom.map((pattern) => (
						<li
							className="flex items-center justify-between gap-2 rounded px-2 py-1"
							key={pattern}
							style={{ background: "var(--vscode-textBlockQuote-background)" }}>
							<code className="text-xs break-all">{pattern}</code>
							<VSCodeButton
								appearance="icon"
								aria-label={t("permissions.allowedCommandsRemove")}
								onClick={() => removeCustom(pattern)}
								title={t("permissions.allowedCommandsRemove")}>
								<span className="codicon codicon-close" />
							</VSCodeButton>
						</li>
					))}
				</ul>
			)}

			<div className="flex gap-2">
				<input
					className="flex-1 rounded-md text-xs p-2"
					data-testid="allowed-commands-input"
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault()
							addCustom()
						}
					}}
					placeholder={t("permissions.allowedCommandsPlaceholder")}
					style={inputStyle}
					value={draft}
				/>
				<VSCodeButton appearance="secondary" disabled={draft.trim().length === 0} onClick={addCustom}>
					{t("permissions.allowedCommandsAdd")}
				</VSCodeButton>
			</div>
		</div>
	)
}

export default AllowedCommandsField
