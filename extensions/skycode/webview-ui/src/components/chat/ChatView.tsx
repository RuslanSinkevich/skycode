import { combineApiRequests } from "@shared/combineApiRequests"
import { combineCommandSequences } from "@shared/combineCommandSequences"
import { combineErrorRetryMessages } from "@shared/combineErrorRetryMessages"
import { combineHookSequences } from "@shared/combineHookSequences"
import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { BannerAction, BannerActionType } from "@shared/skycode/banner"
import { BooleanRequest } from "@shared/proto/skycode/common"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useMount } from "react-use"
import PromoBannerModal from "@/components/common/PromoBannerModal"
import { normalizeApiConfiguration } from "@/components/settings/utils/providerUtils"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useShowNavbar } from "@/context/PlatformContext"
import { useI18n } from "@/i18n"
import { FileServiceClient, StateServiceClient, UiServiceClient } from "@/services/grpc-client"
import { Navbar } from "../menu/Navbar"
// Import utilities and hooks from the new structure
import {
	ActionButtons,
	ApprovalBar,
	CHAT_CONSTANTS,
	ChatLayout,
	filterVisibleMessages,
	groupByTurns,
	groupLowStakesTools,
	groupMessages,
	InputSection,
	MessagesArea,
	TaskSection,
	useChatState,
	useMessageHandlers,
	useScrollBehavior,
	useSession,
	WelcomeSection,
} from "./chat-view"
import { useMessageQueue } from "./chat-view/hooks/useMessageQueue"
import { MessageQueue } from "./chat-view/MessageQueue"
import PendingChangesBar from "./pending-changes/PendingChangesBar"
import { HistoryDrawer } from "../history/HistoryDrawer"
import { TabStrip } from "./tabs/TabStrip"

interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
}

// Use constants from the imported module
const MAX_IMAGES_AND_FILES_PER_MESSAGE = CHAT_CONSTANTS.MAX_IMAGES_AND_FILES_PER_MESSAGE

const ChatView = ({ isHidden, showAnnouncement, hideAnnouncement }: ChatViewProps) => {
	const { t } = useI18n()
	const showNavbar = useShowNavbar()
	const {
		version,
		skycodeMessages: messages,
		taskHistory,
		apiConfiguration,
		mode,
		currentFocusChainChecklist,
		hooksEnabled,
		currentSessionId,
		banners,
	} = useExtensionState()

	// Шторка истории: открывается кнопкой в полосе вкладок и ссылкой «Показать все» на стартовом экране
	const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false)
	const closeHistoryDrawer = useCallback(() => setHistoryDrawerOpen(false), [])
	const [promoModalBannerId, setPromoModalBannerId] = useState<string | null>(null)
	const [dismissedModalId, setDismissedModalId] = useState<string | null>(null)

	const modalBanner = useMemo(() => {
		const modal = (banners ?? []).find((b) => b.placement === "modal")
		if (!modal) { return null }
		if (modal.id === dismissedModalId) { return null }
		return modal
	}, [banners, dismissedModalId])

	useEffect(() => {
		if (modalBanner && promoModalBannerId !== modalBanner.id) {
			setPromoModalBannerId(modalBanner.id)
		}
	}, [modalBanner, promoModalBannerId])

	const handlePromoAction = useCallback((action: BannerAction) => {
		if (action.action === BannerActionType.Link && action.arg) {
			UiServiceClient.openUrl({ value: action.arg }).catch(console.error)
		}
	}, [])

	// --- NEW: Session-based state (pipeline architecture) ---
	const session = useSession(currentSessionId ?? null)

	//const task = messages.length > 0 ? (messages[0].say === "task" ? messages[0] : undefined) : undefined) : undefined
	const task = useMemo(() => messages.at(0), [messages]) // leaving this less safe version here since if the first message is not a task, then the extension is in a bad state and needs to be debugged (see Skycode.abort)

	// isAiWorking defined below after chatState is created
	const modifiedMessages = useMemo(() => {
		const slicedMessages = messages.slice(1)
		// Only combine hook sequences if hooks are enabled
		const withHooks = hooksEnabled ? combineHookSequences(slicedMessages) : slicedMessages
		return combineErrorRetryMessages(combineApiRequests(combineCommandSequences(withHooks)))
	}, [messages, hooksEnabled])

	// Use custom hooks for state management
	const chatState = useChatState(messages)
	const {
		setInputValue,
		selectedImages,
		setSelectedImages,
		selectedFiles,
		setSelectedFiles,
		sendingDisabled,
		enableButtons,
		expandedRows,
		setExpandedRows,
		textAreaRef,
	} = chatState

	// AI is "working" - heuristic based on message state.
	// Conservative: only return true when we KNOW the stream is alive.
	// Returning true while AI is actually idle (no partial, no api_req, no ask)
	// causes messages to be silently queued for an event that never arrives —
	// users perceive it as "extension reloaded, my message vanished".
	// NOTE: session.isWorking disabled — session infra is Step 1 (adapter),
	// frontend subscribes AFTER backend emits "running", so it always misses the event.
	const isAiWorking = useMemo(() => {
		if (messages.length <= 1) {
			return false
		}
		const lastMessage = messages.at(-1)
		if (!lastMessage) {
			return false
		}
		// Streaming partial message → definitely working
		if (lastMessage.partial === true) {
			return true
		}
		// Inflight API request (latest api_req_started without finished marker)
		if (lastMessage.type === "say" && lastMessage.say === "api_req_started") {
			return true
		}
		// AI is asking for input → it's NOT working, it's waiting for user
		if (chatState.skycodeAsk) {
			return false
		}
		// Tool/text/etc. finalized and no ask → AI finished the turn.
		// Treat as idle so the input box can send directly instead of silently queuing.
		return false
	}, [messages, chatState.skycodeAsk])

	// [SKYCODE] Копируется ровно видимый текст, без перевода в Markdown (раньше в буфер
	// попадали __жирный__, обратные кавычки и прочая разметка, которой на экране нет)
	useEffect(() => {
		const handleCopy = (e: ClipboardEvent) => {
			const target = e.target as HTMLElement | null
			if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
				return
			}
			const text = window.getSelection()?.toString()
			if (text && e.clipboardData) {
				e.clipboardData.setData("text/plain", text)
				e.preventDefault()
			}
		}
		document.addEventListener("copy", handleCopy)

		return () => {
			document.removeEventListener("copy", handleCopy)
		}
	}, [])
	// Button state is now managed by useButtonState hook

	// handleFocusChange is already provided by chatState

	// Use message handlers hook
	const messageHandlers = useMessageHandlers(messages, chatState)

	// Message queue for Cursor-style queuing
	const messageQueue = useMessageQueue(messages, chatState.skycodeAsk)

	const { selectedModelInfo } = useMemo(() => {
		return normalizeApiConfiguration(apiConfiguration, mode)
	}, [apiConfiguration, mode])

	const selectFilesAndImages = useCallback(async () => {
		try {
			const response = await FileServiceClient.selectFiles(
				BooleanRequest.create({
					value: selectedModelInfo.supportsImages,
				}),
			)
			if (
				response &&
				response.values1 &&
				response.values2 &&
				(response.values1.length > 0 || response.values2.length > 0)
			) {
				const currentTotal = selectedImages.length + selectedFiles.length
				const availableSlots = MAX_IMAGES_AND_FILES_PER_MESSAGE - currentTotal

				if (availableSlots > 0) {
					// Prioritize images first
					const imagesToAdd = Math.min(response.values1.length, availableSlots)
					if (imagesToAdd > 0) {
						setSelectedImages((prevImages) => [...prevImages, ...response.values1.slice(0, imagesToAdd)])
					}

					// Use remaining slots for files
					const remainingSlots = availableSlots - imagesToAdd
					if (remainingSlots > 0) {
						setSelectedFiles((prevFiles) => [...prevFiles, ...response.values2.slice(0, remainingSlots)])
					}
				}
			}
		} catch (error) {
			console.error("Error selecting images & files:", error)
		}
	}, [selectedModelInfo.supportsImages, selectedImages.length, selectedFiles.length])

	const shouldDisableFilesAndImages = selectedImages.length + selectedFiles.length >= MAX_IMAGES_AND_FILES_PER_MESSAGE

	// Subscribe to show webview events from the backend
	useEffect(() => {
		const cleanup = UiServiceClient.subscribeToShowWebview(
			{},
			{
				onResponse: (event) => {
					// Only focus if not hidden and preserveEditorFocus is false
					if (!isHidden && !event.preserveEditorFocus) {
						textAreaRef.current?.focus()
					}
				},
				onError: (error) => {
					console.error("Error in showWebview subscription:", error)
				},
				onComplete: () => {
					console.log("showWebview subscription completed")
				},
			},
		)

		return cleanup
	}, [isHidden])

	// Set up addToInput subscription
	useEffect(() => {
		const cleanup = UiServiceClient.subscribeToAddToInput(
			{},
			{
				onResponse: (event) => {
					if (event.value) {
						setInputValue((prevValue) => {
							const newText = event.value
							const newTextWithNewline = newText + "\n"
							return prevValue ? `${prevValue}\n${newTextWithNewline}` : newTextWithNewline
						})
						// Add scroll to bottom after state update
						// Auto focus the input and start the cursor on a new line for easy typing
						setTimeout(() => {
							if (textAreaRef.current) {
								textAreaRef.current.scrollTop = textAreaRef.current.scrollHeight
								textAreaRef.current.focus()
							}
						}, 0)
					}
				},
				onError: (error) => {
					console.error("Error in addToInput subscription:", error)
				},
				onComplete: () => {
					console.log("addToInput subscription completed")
				},
			},
		)

		return cleanup
	}, [])

	useMount(() => {
		// NOTE: the vscode window needs to be focused for this to work
		textAreaRef.current?.focus()
	})

	useEffect(() => {
		const id = requestAnimationFrame(() => {
			if (!isHidden && !sendingDisabled && !enableButtons) {
				textAreaRef.current?.focus()
			}
		})
		return () => cancelAnimationFrame(id)
	}, [isHidden, sendingDisabled, enableButtons])

	// Focus textarea when task is cleared (e.g. "+" button in navbar)
	const prevTaskRef = useRef(task)
	useEffect(() => {
		const hadTask = prevTaskRef.current
		prevTaskRef.current = task
		// Only focus when transitioning from having a task to no task
		if (hadTask && !task && !isHidden) {
			let alive = true
			const chainFocus = () => {
				if (!alive) {
					return
				}
				textAreaRef.current?.focus()
				requestAnimationFrame(() => {
					if (!alive) {
						return
					}
					textAreaRef.current?.focus()
					requestAnimationFrame(() => {
						if (!alive) {
							return
						}
						textAreaRef.current?.focus()
					})
				})
			}
			const id = requestAnimationFrame(chainFocus)
			return () => {
				alive = false
				cancelAnimationFrame(id)
			}
		}
	}, [task, isHidden])

	const visibleMessages = useMemo(() => {
		const filtered = filterVisibleMessages(modifiedMessages)
		if (messageQueue.queue.length === 0) {
			return filtered
		}
		const phantoms: SkycodeMessage[] = messageQueue.queue.map((qm) => ({
			ts: Number(qm.id.split("-")[0]) || Date.now(),
			type: "say",
			say: "user_feedback" as const,
			text: qm.text,
			images: qm.images,
			files: qm.files,
			partial: false,
			pending: true,
		}))
		return [...filtered, ...phantoms]
	}, [modifiedMessages, messageQueue.queue])

	const lastProgressMessageText = useMemo(() => {
		// First check if we have a current focus chain list from the extension state
		if (currentFocusChainChecklist) {
			return currentFocusChainChecklist
		}

		// Fall back to the last task_progress message if no state focus chain list
		const lastProgressMessage = [...modifiedMessages].reverse().find((message) => message.say === "task_progress")
		return lastProgressMessage?.text
	}, [modifiedMessages, currentFocusChainChecklist])

	const groupedMessages = useMemo(() => {
		return groupLowStakesTools(groupMessages(visibleMessages))
	}, [visibleMessages])

	const turns = useMemo(() => {
		return groupByTurns(groupedMessages, task)
	}, [groupedMessages, task])

	// Use scroll behavior hook
	const scrollBehavior = useScrollBehavior(messages, visibleMessages, turns, expandedRows, setExpandedRows)

	const placeholderText = useMemo(() => {
		const text = task ? t("chat.placeholder.message") : t("chat.placeholder.task")
		return text
	}, [task, t])

	const handleCancel = useCallback(() => {
		messageHandlers.executeButtonAction("cancel").catch((err) => {
			console.error("[ChatView] cancel failed:", err)
		})
	}, [messageHandlers])

	return (<>
		<ChatLayout isHidden={isHidden}>
			<div className="flex flex-col flex-1 overflow-hidden">
				{showNavbar && <Navbar />}
				<TabStrip onToggleHistory={() => setHistoryDrawerOpen((open) => !open)} />
				{task ? (
					<TaskSection lastProgressMessageText={lastProgressMessageText} />
				) : (
					<WelcomeSection
						hideAnnouncement={hideAnnouncement}
						showAnnouncement={showAnnouncement}
						showHistoryView={() => setHistoryDrawerOpen(true)}
						taskHistory={taskHistory}
						version={version}
					/>
				)}
				{task && (
					<MessagesArea
						chatState={chatState}
						messageHandlers={messageHandlers}
						modifiedMessages={modifiedMessages}
						scrollBehavior={scrollBehavior}
						task={task}
						turns={turns}
					/>
				)}
			</div>
			<footer className="bg-(--vscode-sidebar-background)" style={{ gridRow: "2" }}>
				<PendingChangesBar />
				<ApprovalBar
					approvals={session.approvals}
					onApprove={session.approve}
					onReject={session.reject}
				/>
				<ActionButtons
					chatState={chatState}
					messageHandlers={messageHandlers}
					messages={messages}
					mode={mode}
					scrollBehavior={{
						scrollToBottomSmooth: scrollBehavior.scrollToBottomSmooth,
						disableAutoScrollRef: scrollBehavior.disableAutoScrollRef,
						showScrollToBottom: scrollBehavior.showScrollToBottom,
					}}
					task={task}
				/>
				<MessageQueue
					inputEmpty={chatState.inputValue.trim().length === 0}
					onClearQueue={messageQueue.clearQueue}
					onRemoveSelected={messageQueue.removeSelected}
					onSelectItem={messageQueue.selectItem}
					onSendNow={messageQueue.sendNow}
					queue={messageQueue.queue}
					selectedIndex={messageQueue.selectedIndex}
				/>
				<InputSection
					chatState={chatState}
					isAiWorking={isAiWorking}
					messageHandlers={messageHandlers}
					messageQueue={messageQueue}
					onCancel={handleCancel}
					placeholderText={placeholderText}
					scrollBehavior={scrollBehavior}
					selectFilesAndImages={selectFilesAndImages}
					shouldDisableFilesAndImages={shouldDisableFilesAndImages}
				/>
			</footer>
		</ChatLayout>
		{!isHidden && <HistoryDrawer onClose={closeHistoryDrawer} open={historyDrawerOpen} />}
		{promoModalBannerId && modalBanner && (
			<PromoBannerModal
				banner={modalBanner}
				onAction={handlePromoAction}
				onClose={() => {
					if (promoModalBannerId) {
						StateServiceClient.dismissBanner({ value: promoModalBannerId }).catch(() => {})
					}
					setDismissedModalId(promoModalBannerId)
					setPromoModalBannerId(null)
				}}
			/>
		)}
	</>
	)
}

export default ChatView
