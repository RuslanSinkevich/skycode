import React, { useRef } from "react"
import ChatTextArea from "@/components/chat/ChatTextArea"
import type { MessageQueueActions } from "../../hooks/useMessageQueue"
import { decideEnterAction } from "../../shared/enterAction"
import { ChatState, MessageHandlers, ScrollBehavior } from "../../types/chatTypes"

interface InputSectionProps {
	chatState: ChatState
	messageHandlers: MessageHandlers
	scrollBehavior: ScrollBehavior
	placeholderText: string
	shouldDisableFilesAndImages: boolean
	selectFilesAndImages: () => Promise<void>
	/** Is AI currently working (streaming)? */
	isAiWorking?: boolean
	/** Message queue for Cursor-style queuing */
	messageQueue?: MessageQueueActions & { queue: { id: string; text: string }[] }
	/** Cancel the currently running task */
	onCancel?: () => void
}

/**
 * Input section including chat text area
 */
export const InputSection: React.FC<InputSectionProps> = ({
	chatState,
	messageHandlers,
	scrollBehavior,
	placeholderText,
	shouldDisableFilesAndImages,
	selectFilesAndImages,
	isAiWorking,
	messageQueue,
	onCancel,
}) => {
	const {
		inputValue,
		setInputValue,
		sendingDisabled,
		selectedImages,
		setSelectedImages,
		selectedFiles,
		setSelectedFiles,
		textAreaRef,
		handleFocusChange,
	} = chatState

	const { isAtBottom, keepAtBottom } = scrollBehavior
	const prevTextAreaHeightRef = useRef(0)

	// Handle send - queue if AI is working, send directly otherwise.
	// Snapshot input state up-front so any later state churn (e.g. webview re-render
	// while sending) can't silently swallow the user's message.
	const handleSend = () => {
		const text = inputValue.trim()
		const imagesSnapshot = selectedImages.slice()
		const filesSnapshot = selectedFiles.slice()
		// [SKYCODE] Меню слеш-команд/@ обрабатывает Enter раньше (useInputHandlers), сюда он доходит только без меню
		const action = decideEnterAction({
			text,
			hasAttachments: imagesSnapshot.length > 0 || filesSnapshot.length > 0,
			queueLength: messageQueue?.queue.length ?? 0,
			isAgentWorking: !!isAiWorking && !!messageQueue,
			menuOpen: false,
		})
		if (action === "none") {
			return
		}
		if (action === "sendQueued") {
			// [SKYCODE] Пустой ввод + непустая очередь: отправить самое старое сообщение (как кнопка «→»)
			void messageQueue?.sendNow()
			return
		}

		if (action === "enqueue" && messageQueue) {
			// AI is working - add to queue instead of sending
			messageQueue.addToQueue(text, imagesSnapshot, filesSnapshot)
			setInputValue("")
			setSelectedImages([])
			setSelectedFiles([])
			return
		}

		// AI not working - send directly. If the send throws (e.g. backend
		// crashed or webview just remounted), restore the input so the user
		// doesn't lose their message.
		Promise.resolve()
			.then(() => messageHandlers.handleSendMessage(inputValue, imagesSnapshot, filesSnapshot))
			.catch((err) => {
				console.error("[InputSection] handleSendMessage failed, restoring input:", err)
				setInputValue(text)
				setSelectedImages(imagesSnapshot)
				setSelectedFiles(filesSnapshot)
			})
	}

	return (
		<>
			<ChatTextArea
				inputValue={inputValue}
				isAiWorking={isAiWorking}
				onCancel={onCancel}
				onFocusChange={handleFocusChange}
			onHeightChange={(height: number) => {
				const grew = prevTextAreaHeightRef.current > 0 && height > prevTextAreaHeightRef.current
				prevTextAreaHeightRef.current = height
				if (grew && isAtBottom) {
					keepAtBottom()
				}
			}}
				onSelectFilesAndImages={selectFilesAndImages}
				onSend={handleSend}
				placeholderText={placeholderText}
				ref={textAreaRef}
				selectedFiles={selectedFiles}
				selectedImages={selectedImages}
				sendingDisabled={sendingDisabled}
				setInputValue={setInputValue}
				setSelectedFiles={setSelectedFiles}
				setSelectedImages={setSelectedImages}
				shouldDisableFilesAndImages={shouldDisableFilesAndImages}
			/>
		</>
	)
}
