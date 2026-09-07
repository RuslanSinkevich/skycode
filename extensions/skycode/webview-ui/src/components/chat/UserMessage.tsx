import { Int64Request } from "@shared/proto/skycode/common"
import { ResendFromMessageRequest } from "@shared/proto/skycode/task"
import React, { useEffect, useMemo, useRef, useState } from "react"
import DynamicTextArea from "react-textarea-autosize"
import Thumbnails from "@/components/common/Thumbnails"
import { useI18n } from "@/i18n"
import { TaskServiceClient } from "@/services/grpc-client"
import { highlightText } from "./task-header/Highlights"

interface UserMessageProps {
	text?: string
	files?: string[]
	images?: string[]
	messageTs?: number
	isPending?: boolean
	sendMessageFromChatRow?: (text: string, images: string[], files: string[]) => void
}

const UserMessage: React.FC<UserMessageProps> = ({ text, images, files, messageTs, isPending, sendMessageFromChatRow: _sendMessageFromChatRow }) => {
	const { t } = useI18n()
	const [isEditing, setIsEditing] = useState(false)
	const [editedText, setEditedText] = useState(text || "")
	const [isHovered, setIsHovered] = useState(false)
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const resendButtonRef = useRef<HTMLButtonElement>(null)

	const highlightedText = useMemo(() => highlightText(editedText || text), [editedText, text])

	// Delete message and revert all changes from this point
	const handleDelete = async (e: React.MouseEvent) => {
		e.stopPropagation()
		if (!messageTs) { return }
		try {
			await TaskServiceClient.deleteFromMessage(Int64Request.create({ value: messageTs }))
		} catch (err) {
			console.error("Delete from message error:", err)
		}
	}

	// Retry: revert changes, delete history, resend same message
	const handleRetry = async (e: React.MouseEvent) => {
		e.stopPropagation()
		if (!messageTs) { return }
		try {
			await TaskServiceClient.retryFromMessage(Int64Request.create({ value: messageTs }))
		} catch (err) {
			console.error("Retry from message error:", err)
		}
	}

	// Resend: atomic backend op — truncates history at this message and sends the
	// edited text in one round trip. Avoids the down-then-up scroll jitter caused
	// by separate deleteFromMessage + sendMessage calls (chat sees two state updates).
	const handleResend = async () => {
		setIsEditing(false)
		if (!messageTs || editedText === text) { return }
		try {
			await TaskServiceClient.resendFromMessage(
				ResendFromMessageRequest.create({
					messageTs,
					text: editedText,
					images: images || [],
					files: files || [],
				}),
			)
		} catch (err) {
			console.error("Resend message error:", err)
		}
	}

	const handleClick = () => {
		if (!isEditing) {
			setIsEditing(true)
		}
	}

	// Select all text when entering edit mode
	useEffect(() => {
		if (isEditing && textAreaRef.current) {
			textAreaRef.current.select()
		}
	}, [isEditing])

	// Intentionally no onBlur close — buttons stay visible so the user can
	// click Cancel/Resend without losing focus first. Escape still exits.
	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Escape") {
			setEditedText(text || "")
			setIsEditing(false)
		} else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
			e.preventDefault()
			handleResend()
		}
	}

	return (
		<div
			className="p-2.5 pr-1 my-1 rounded-xs bg-user-message-bg text-input-foreground border border-description/15"
			onClick={isPending ? undefined : handleClick}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			style={{
				whiteSpace: "pre-line",
				wordWrap: "break-word",
				position: "relative",
				opacity: isPending ? 0.6 : 1,
			}}>
			{/* Delete/Retry buttons on hover */}
			{isHovered && !isEditing && messageTs && (
				<div
					style={{
						position: "absolute",
						top: "4px",
						right: "4px",
						display: "flex",
						gap: "4px",
						zIndex: 10,
					}}>
					{/* allow-any-unicode-next-line */}
					<ActionButton icon="↻" onClick={handleRetry} title={t("chat.retryRevertAndResend")} />
					{/* allow-any-unicode-next-line */}
					<ActionButton icon="🗑" onClick={handleDelete} title={t("chat.deleteRevertFromMessage")} />
				</div>
			)}
			{isEditing ? (
				<>
					<DynamicTextArea
						autoFocus
						onChange={(e) => setEditedText(e.target.value)}
						onKeyDown={handleKeyDown}
						ref={textAreaRef}
						style={{
							width: "100%",
							backgroundColor: "var(--vscode-input-background)",
							color: "var(--vscode-input-foreground)",
							borderColor: "var(--vscode-input-border)",
							border: "1px solid",
							borderRadius: "2px",
							padding: "6px",
							fontFamily: "inherit",
							fontSize: "inherit",
							lineHeight: "inherit",
							boxSizing: "border-box",
							resize: "none",
							overflowX: "hidden",
							overflowY: "scroll",
							scrollbarWidth: "none",
						}}
						value={editedText}
					/>
					{/* Always-visible action row during edit so the user doesn't have
					    to blur the textarea (which exited edit mode) to find buttons. */}
					<div style={{ display: "flex", gap: "8px", marginTop: "8px", justifyContent: "flex-end" }}>
						<button
							onClick={(e) => {
								e.stopPropagation()
								setEditedText(text || "")
								setIsEditing(false)
							}}
							style={{
								backgroundColor: "var(--vscode-button-secondaryBackground)",
								color: "var(--vscode-button-secondaryForeground)",
								border: "none",
								padding: "4px 8px",
								borderRadius: "2px",
								fontSize: "9px",
								cursor: "pointer",
							}}
							title={t("chat.cancelEdit")}>
							{t("chat.cancel")}
						</button>
						<button
							disabled={editedText === text || editedText.trim().length === 0}
							onClick={(e) => {
								e.stopPropagation()
								handleResend()
							}}
							ref={resendButtonRef}
							style={{
								backgroundColor: "var(--vscode-button-background)",
								color: "var(--vscode-button-foreground)",
								border: "none",
								padding: "4px 8px",
								borderRadius: "2px",
								fontSize: "9px",
								cursor: editedText === text || editedText.trim().length === 0 ? "not-allowed" : "pointer",
								opacity: editedText === text || editedText.trim().length === 0 ? 0.5 : 1,
							}}
							title={t("chat.resendEdited")}>
							{t("chat.resend")}
						</button>
					</div>
				</>
			) : (
				<span className="ph-no-capture text-sm" style={{ display: "block" }}>
					{highlightedText}
				</span>
			)}
			{((images && images.length > 0) || (files && files.length > 0)) && (
				<Thumbnails files={files ?? []} images={images ?? []} style={{ marginTop: "8px" }} />
			)}
		</div>
	)
}

// Action button for Delete/Retry
interface ActionButtonProps {
	icon: string
	onClick: (e: React.MouseEvent) => void
	title: string
}

const ActionButton: React.FC<ActionButtonProps> = ({ icon, onClick, title }) => {
	return (
		<button
			onClick={onClick}
			onMouseEnter={(e) => {
				e.currentTarget.style.opacity = "1"
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.opacity = "0.8"
			}}
			style={{
				backgroundColor: "var(--vscode-button-secondaryBackground)",
				color: "var(--vscode-button-secondaryForeground)",
				border: "none",
				padding: "2px 6px",
				borderRadius: "3px",
				fontSize: "12px",
				cursor: "pointer",
				opacity: 0.8,
				transition: "opacity 0.15s",
			}}
			title={title}>
			{icon}
		</button>
	)
}

export default UserMessage
