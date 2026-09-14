import { COMMAND_OUTPUT_STRING } from "@shared/combineCommandSequences"
import type { SkycodeMessage } from "@shared/ExtensionMessage"
import type { Mode } from "@shared/storage/types"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import type React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { updateAutoApproveSettings } from "@/components/chat/auto-approve-menu/AutoApproveSettingsAPI"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { ButtonActionType, getButtonConfig } from "../../shared/buttonConfig"
import type { ChatState, MessageHandlers } from "../../types/chatTypes"

interface ActionButtonsProps {
	task?: SkycodeMessage
	messages: SkycodeMessage[]
	chatState: ChatState
	messageHandlers: MessageHandlers
	mode: Mode
	scrollBehavior: {
		scrollToBottomSmooth: () => void
		disableAutoScrollRef: React.MutableRefObject<boolean>
		showScrollToBottom: boolean
	}
}

/**
 * Action buttons area including scroll-to-bottom and approve/reject buttons
 */
export const ActionButtons: React.FC<ActionButtonsProps> = ({
	task,
	messages,
	chatState,
	mode,
	messageHandlers,
	scrollBehavior: _scrollBehavior,
}) => {
	const { t } = useI18n()
	const { inputValue, selectedImages, selectedFiles, setSendingDisabled } = chatState
	const [isProcessing, setIsProcessing] = useState(false)
	// [SKYCODE] backgroundCommandRunning — флаг что команда уже одобрена и работает.
	// Держим видимую панель выполнения с Cancel, чтобы UI не выглядел зависшим.
	const { backgroundCommandRunning, autoApprovalSettings } = useExtensionState()

	// Memoize last messages to avoid unnecessary recalculations
	const [lastMessage, secondLastMessage] = useMemo(() => {
		const len = messages.length
		return len > 0 ? [messages[len - 1], messages[len - 2]] : [undefined, undefined]
	}, [messages])

	// Memoize button configuration to avoid recalculation on every render
	const buttonConfig = useMemo(() => {
		return lastMessage ? getButtonConfig(lastMessage, mode) : { sendingDisabled: false, enableButtons: false }
	}, [lastMessage, mode])

	// Single effect to handle all configuration updates
	useEffect(() => {
		setSendingDisabled(buttonConfig.sendingDisabled)
		setIsProcessing(false)
	}, [buttonConfig, setSendingDisabled])

	// Clear input when transitioning from command_output to api_req
	// This happens when user provides feedback during command execution
	useEffect(() => {
		if (lastMessage?.type === "say" && lastMessage.say === "api_req_started" && secondLastMessage?.ask === "command_output") {
			chatState.setInputValue("")
			chatState.setSelectedImages([])
			chatState.setSelectedFiles([])
		}
	}, [lastMessage?.type, lastMessage?.say, secondLastMessage?.ask, chatState])

	const handleActionClick = useCallback(
		async (action: ButtonActionType, text?: string, images?: string[], files?: string[]) => {
			// Cancel should always work, even if other actions are processing
			if (action !== "cancel" && isProcessing) {
				return
			}

			// Only set processing flag for non-cancel actions
			if (action !== "cancel") {
				setIsProcessing(true)
			}

			try {
				await messageHandlers.executeButtonAction(action, text, images, files)
			} catch (error) {
				console.error("[ActionButtons] executeButtonAction failed:", error)
			} finally {
				// Keep cancel behavior instant, and always unlock buttons on errors.
				if (action !== "cancel") {
					setIsProcessing(false)
				}
			}
		},
		[messageHandlers, isProcessing],
	)

	// [SKYCODE] The command awaiting approval, so it can be whitelisted from here.
	// message.text carries the command and, once it starts, its output after the
	// separator — only the command itself goes into the list.
	const pendingCommand = useMemo(() => {
		if (lastMessage?.type !== "ask" || lastMessage.ask !== "command") {
			return undefined
		}
		const text = lastMessage.text ?? ""
		const outputIndex = text.indexOf(COMMAND_OUTPUT_STRING)
		const command = (outputIndex === -1 ? text : text.slice(0, outputIndex)).trim()
		return command.length > 0 ? command : undefined
	}, [lastMessage])

	const isAlreadyAllowed = pendingCommand
		? (autoApprovalSettings.actions.allowedCommandPatterns ?? []).includes(pendingCommand)
		: false

	// Add the command to the allowed list and run it in one click.
	const handleAlwaysAllow = useCallback(
		async (action: ButtonActionType) => {
			if (!pendingCommand || isProcessing) {
				return
			}
			try {
				if (!isAlreadyAllowed) {
					const patterns = autoApprovalSettings.actions.allowedCommandPatterns ?? []
					await updateAutoApproveSettings({
						...autoApprovalSettings,
						version: (autoApprovalSettings.version ?? 1) + 1,
						actions: {
							...autoApprovalSettings.actions,
							allowedCommandPatterns: [...patterns, pendingCommand],
						},
					})
				}
			} catch (error) {
				console.error("[ActionButtons] Failed to add command to the allowed list:", error)
			}
			await handleActionClick(action, inputValue, selectedImages, selectedFiles)
		},
		[
			autoApprovalSettings,
			handleActionClick,
			inputValue,
			isAlreadyAllowed,
			isProcessing,
			pendingCommand,
			selectedFiles,
			selectedImages,
		],
	)

	// Keyboard event handler
	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.preventDefault()
				event.stopPropagation()
				messageHandlers.executeButtonAction("cancel")
			}
		},
		[messageHandlers],
	)

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown)
		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [handleKeyDown])

	if (!task) {
		return null
	}

	const { primaryText, secondaryText, primaryAction, secondaryAction, enableButtons } = buttonConfig
	const hasButtons = primaryText || secondaryText
	const isStreaming = task.partial === true
	const canInteract = enableButtons && !isProcessing

	// [SKYCODE] Команда уже одобрена и идёт — держим закреплённую видимую панель статуса.
	const isApprovedCommandRunning =
		backgroundCommandRunning &&
		lastMessage?.type === "ask" &&
		(lastMessage.ask === "command" || lastMessage.ask === "command_output")

	if (isApprovedCommandRunning) {
		return (
			<div className="sticky bottom-0 z-10 flex items-center gap-2 border-t border-(--vscode-panel-border) bg-(--vscode-sideBar-background) px-3.5 py-2">
				<div className="flex min-w-0 flex-1 items-center gap-2 text-xs text-(--vscode-descriptionForeground)">
					<span className="codicon codicon-loading codicon-modifier-spin shrink-0" />
					<span className="truncate">{t("button.executing")}</span>
				</div>
				<VSCodeButton
					appearance="secondary"
					className="shrink-0"
					onClick={() => handleActionClick("cancel")}>
					{t("button.cancel")}
				</VSCodeButton>
			</div>
		)
	}

	if (!hasButtons) {
		return null
	}

	const opacity = canInteract || isStreaming ? 1 : 0.5

	return (
		<div className="flex flex-col px-3.5" style={{ opacity }}>
			<div className="flex">
				{primaryText && primaryAction && (
					<VSCodeButton
						appearance="primary"
						className={secondaryText ? "flex-1 mr-[6px]" : "flex-2"}
						disabled={!canInteract}
						onClick={() => handleActionClick(primaryAction, inputValue, selectedImages, selectedFiles)}>
						{t(primaryText)}
					</VSCodeButton>
				)}
				{secondaryText && secondaryAction && (
					<VSCodeButton
						appearance="secondary"
						className={primaryText ? "flex-1" : "flex-2"}
						disabled={!canInteract}
						onClick={() => handleActionClick(secondaryAction, inputValue, selectedImages, selectedFiles)}>
						{t(secondaryText)}
					</VSCodeButton>
				)}
			</div>
			{/* [SKYCODE] Approve and remember: puts the command into Settings → Terminal → Allowed commands */}
			{pendingCommand && primaryAction && (
				<button
					className="mt-1.5 flex items-center gap-1.5 bg-transparent border-0 p-0 text-xs text-(--vscode-textLink-foreground) cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-default"
					data-testid="always-allow-command-button"
					disabled={!canInteract}
					onClick={() => handleAlwaysAllow(primaryAction)}
					title={t("button.alwaysAllowCommandTooltip")}
					type="button">
					<span className="codicon codicon-check-all shrink-0" />
					<span className="truncate">
						{isAlreadyAllowed ? t("button.alwaysAllowCommandAlready") : t("button.alwaysAllowCommand")}
					</span>
					<code className="truncate opacity-70">{pendingCommand}</code>
				</button>
			)}
		</div>
	)
}
