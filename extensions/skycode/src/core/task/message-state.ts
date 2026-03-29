import CheckpointTracker from "@integrations/checkpoints/CheckpointTracker"
import getFolderSize from "get-folder-size"
import Mutex from "p-mutex"
import { findLastIndex } from "@/shared/array"
import { combineApiRequests } from "@/shared/combineApiRequests"
import { combineCommandSequences } from "@/shared/combineCommandSequences"
import { SkycodeMessage } from "@/shared/ExtensionMessage"
import { getApiMetrics } from "@/shared/getApiMetrics"
import { HistoryItem } from "@/shared/HistoryItem"
import { SkycodeStorageMessage } from "@/shared/messages/content"
import { Logger } from "@/shared/services/Logger"
import { getCwd, getDesktopDir } from "@/utils/path"
import { ensureTaskDirectoryExists, saveApiConversationHistory, saveSkycodeMessages } from "../storage/disk"
import { TaskState } from "./TaskState"

interface MessageStateHandlerParams {
	taskId: string
	ulid: string
	taskIsFavorited?: boolean
	updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	taskState: TaskState
	checkpointManagerErrorMessage?: string
}

export class MessageStateHandler {
	private apiConversationHistory: SkycodeStorageMessage[] = []
	private skycodeMessages: SkycodeMessage[] = []
	private taskIsFavorited: boolean
	private checkpointTracker: CheckpointTracker | undefined
	private updateTaskHistory: (historyItem: HistoryItem) => Promise<HistoryItem[]>
	private taskId: string
	private ulid: string
	private taskState: TaskState

	// Mutex to prevent concurrent state modifications (RC-4)
	// Protects against data loss from race conditions when multiple
	// operations try to modify message state simultaneously
	// This follows the same pattern as Task.stateMutex for consistency
	private stateMutex = new Mutex()

	constructor(params: MessageStateHandlerParams) {
		this.taskId = params.taskId
		this.ulid = params.ulid
		this.taskState = params.taskState
		this.taskIsFavorited = params.taskIsFavorited ?? false
		this.updateTaskHistory = params.updateTaskHistory
	}

	setCheckpointTracker(tracker: CheckpointTracker | undefined) {
		this.checkpointTracker = tracker
	}

	/**
	 * Execute function with exclusive lock on message state
	 * Use this for ANY state modification to prevent race conditions
	 * This follows the same pattern as Task.withStateLock for consistency
	 */
	private async withStateLock<T>(fn: () => T | Promise<T>): Promise<T> {
		return await this.stateMutex.withLock(fn)
	}

	getApiConversationHistory(): SkycodeStorageMessage[] {
		return this.apiConversationHistory
	}

	setApiConversationHistory(newHistory: SkycodeStorageMessage[]): void {
		this.apiConversationHistory = newHistory
	}

	getSkycodeMessages(): SkycodeMessage[] {
		return this.skycodeMessages
	}

	setSkycodeMessages(newMessages: SkycodeMessage[]) {
		this.skycodeMessages = newMessages
	}

	/**
	 * Internal method to save messages and update history (without mutex protection)
	 * This is used by methods that already hold the stateMutex lock
	 * Should NOT be called directly - use saveSkycodeMessagesAndUpdateHistory() instead
	 */
	private async saveSkycodeMessagesAndUpdateHistoryInternal(): Promise<void> {
		try {
			await saveSkycodeMessages(this.taskId, this.skycodeMessages)

			// combined as they are in ChatView
			const apiMetrics = getApiMetrics(combineApiRequests(combineCommandSequences(this.skycodeMessages.slice(1))))
			const taskMessage = this.skycodeMessages[0] // first message is always the task say
			const lastRelevantMessage =
				this.skycodeMessages[
					findLastIndex(
						this.skycodeMessages,
						(message) => !(message.ask === "resume_task" || message.ask === "resume_completed_task"),
					)
				]
			const lastModelInfo = [...this.apiConversationHistory].reverse().find((msg) => msg.modelInfo !== undefined)
			const taskDir = await ensureTaskDirectoryExists(this.taskId)
			let taskDirSize = 0
			try {
				// getFolderSize.loose silently ignores errors
				// returns # of bytes, size/1000/1000 = MB
				taskDirSize = await getFolderSize.loose(taskDir)
			} catch (error) {
				Logger.error("Failed to get task directory size:", taskDir, error)
			}
			const cwd = await getCwd(getDesktopDir())
			await this.updateTaskHistory({
				id: this.taskId,
				ulid: this.ulid,
				ts: lastRelevantMessage.ts,
				task: taskMessage.text ?? "",
				tokensIn: apiMetrics.totalTokensIn,
				tokensOut: apiMetrics.totalTokensOut,
				cacheWrites: apiMetrics.totalCacheWrites,
				cacheReads: apiMetrics.totalCacheReads,
				totalCost: apiMetrics.totalCost,
				size: taskDirSize,
				shadowGitConfigWorkTree: await this.checkpointTracker?.getShadowGitConfigWorkTree(),
				cwdOnTaskInitialization: cwd,
				conversationHistoryDeletedRange: this.taskState.conversationHistoryDeletedRange,
				isFavorited: this.taskIsFavorited,
				checkpointManagerErrorMessage: this.taskState.checkpointManagerErrorMessage,
				modelId: lastModelInfo?.modelInfo?.modelId,
			})
		} catch (error) {
			Logger.error("Failed to save skycode messages:", error)
		}
	}

	/**
	 * Save skycode messages and update task history (public API with mutex protection)
	 * This is the main entry point for saving message state from external callers
	 */
	async saveSkycodeMessagesAndUpdateHistory(): Promise<void> {
		return await this.withStateLock(async () => {
			await this.saveSkycodeMessagesAndUpdateHistoryInternal()
		})
	}

	async addToApiConversationHistory(message: SkycodeStorageMessage) {
		// Protect with mutex to prevent concurrent modifications from corrupting data (RC-4)
		return await this.withStateLock(async () => {
			this.apiConversationHistory.push(message)
			await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
		})
	}

	async overwriteApiConversationHistory(newHistory: SkycodeStorageMessage[]): Promise<void> {
		// Protect with mutex to prevent concurrent modifications from corrupting data (RC-4)
		return await this.withStateLock(async () => {
			this.apiConversationHistory = newHistory
			await saveApiConversationHistory(this.taskId, this.apiConversationHistory)
		})
	}

	/**
	 * Add a new message to skycodeMessages array with proper index tracking
	 * CRITICAL: This entire operation must be atomic to prevent race conditions (RC-4)
	 * The conversationHistoryIndex must be set correctly based on the current state,
	 * and the message must be added and saved without any interleaving operations
	 */
	async addToSkycodeMessages(message: SkycodeMessage) {
		return await this.withStateLock(async () => {
			// these values allow us to reconstruct the conversation history at the time this skycode message was created
			// it's important that apiConversationHistory is initialized before we add skycode messages
			message.conversationHistoryIndex = this.apiConversationHistory.length - 1 // NOTE: this is the index of the last added message which is the user message, and once the skycodemessages have been presented we update the apiconversationhistory with the completed assistant message. This means when resetting to a message, we need to +1 this index to get the correct assistant message that this tool use corresponds to
			message.conversationHistoryDeletedRange = this.taskState.conversationHistoryDeletedRange
			this.skycodeMessages.push(message)
			await this.saveSkycodeMessagesAndUpdateHistoryInternal()
		})
	}

	/**
	 * Replace the entire skycodeMessages array with new messages
	 * Protected by mutex to prevent concurrent modifications (RC-4)
	 */
	async overwriteSkycodeMessages(newMessages: SkycodeMessage[]) {
		return await this.withStateLock(async () => {
			this.skycodeMessages = newMessages
			await this.saveSkycodeMessagesAndUpdateHistoryInternal()
		})
	}

	/**
	 * Update a specific message in the skycodeMessages array
	 * The entire operation (validate, update, save) is atomic to prevent races (RC-4)
	 */
	async updateSkycodeMessage(index: number, updates: Partial<SkycodeMessage>): Promise<void> {
		return await this.withStateLock(async () => {
			if (index < 0 || index >= this.skycodeMessages.length) {
				throw new Error(`Invalid message index: ${index}`)
			}

			// Apply updates to the message
			Object.assign(this.skycodeMessages[index], updates)

			// Save changes and update history
			await this.saveSkycodeMessagesAndUpdateHistoryInternal()
		})
	}

	/**
	 * Delete a specific message from the skycodeMessages array
	 * The entire operation (validate, delete, save) is atomic to prevent races (RC-4)
	 */
	async deleteSkycodeMessage(index: number): Promise<void> {
		return await this.withStateLock(async () => {
			if (index < 0 || index >= this.skycodeMessages.length) {
				throw new Error(`Invalid message index: ${index}`)
			}

			// Remove the message at the specified index
			this.skycodeMessages.splice(index, 1)

			// Save changes and update history
			await this.saveSkycodeMessagesAndUpdateHistoryInternal()
		})
	}
}
