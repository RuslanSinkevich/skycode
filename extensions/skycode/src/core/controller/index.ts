import type { Anthropic } from "@anthropic-ai/sdk"
import { buildApiHandler } from "@core/api"
import { sanitizeTruncatedPlaceholder } from "@shared/proto-conversions/skycode-message"
import { getHooksEnabledSafe } from "@core/hooks/hooks-utils"
import { detectWorkspaceRoots } from "@core/workspace/detection"
import { setupWorkspaceManager } from "@core/workspace/setup"
import type { WorkspaceRootManager } from "@core/workspace/WorkspaceRootManager"
import { McpHub } from "@services/mcp/McpHub"
import type { ApiProvider, ModelInfo } from "@shared/api"
import type { ChatContent } from "@shared/ChatContent"
import type { ExtensionState, Platform, PendingChangeInfo } from "@shared/ExtensionMessage"
import { getPendingChangesStorage } from "@core/diff-v2/storage/PendingChangesStorage"
import { getDiffSystem } from "@core/diff-v2"
import { getBackendLocaleForPreferredLanguage, setBackendLocale, t } from "../../i18n/backend-i18n"
import type { HistoryItem } from "@shared/HistoryItem"
import type { McpMarketplaceCatalog, McpMarketplaceItem } from "@shared/mcp"
import type { Settings } from "@shared/storage/state-keys"
import { getApiSettingsMode, type Mode } from "@shared/storage/types"
import { fileExistsAtPath } from "@utils/fs"
import axios from "axios"
import fs from "fs/promises"
import open from "open"
import pWaitFor from "p-wait-for"
import * as path from "path"
import * as vscode from "vscode"
import { SkycodeEnv } from "@/config"
import { HostProvider } from "@/hosts/host-provider"
import { ExtensionRegistryInfo } from "@/registry"
import { getDistinctId } from "@/services/logging/distinctId"
import PROVIDERS from "@/shared/providers/providers.json"
import { BannerCardData } from "@/shared/skycode/banner"
import { DEFAULT_INDEXING_CONFIG, type IndexingConfig, type IndexingMode, type LocalModelId } from "@/shared/IndexingTypes"
import { getAxiosSettings } from "@/shared/net"
import { ShowMessageType } from "@/shared/proto/host/window"
import { Logger } from "@/shared/services/Logger"
import { getLatestAnnouncementId } from "@/utils/announcements"
import { getCwd, getDesktopDir } from "@/utils/path"
import { PromptRegistry } from "../prompts/system-prompt"
import { getModelCapabilityTier, getSessionLimitsForModel } from "@utils/model-utils"
import {
	ensureCacheDirectoryExists,
	ensureMcpServersDirectoryExists,
	ensureSettingsDirectoryExists,
	GlobalFileNames,
	writeMcpMarketplaceCatalogToCache,
} from "../storage/disk"
import { type PersistenceErrorEvent, StateManager } from "../storage/StateManager"
import { Task } from "../task"
import { SessionManager } from "../session"
import { sendMcpMarketplaceCatalogEvent } from "./mcp/subscribeToMcpMarketplaceCatalog"
import { getSkycodeOnboardingModels } from "./models/getSkycodeOnboardingModels"
import { appendSkycodeStealthModels } from "./models/refreshOpenRouterModels"
import { sendStateUpdate } from "./state/subscribeToState"
import { sendChatButtonClickedEvent } from "./ui/subscribeToChatButtonClicked"

/*
https://github.com/microsoft/vscode-webview-ui-toolkit-samples/blob/main/default/weather-webview/src/providers/WeatherViewProvider.ts

https://github.com/KumarVariable/vscode-extension-sidebar-html/blob/master/src/customSidebarViewProvider.ts
*/

export class Controller {
	// [SKYCODE] Хранилище задачи приватное; чтение только через activeTask (единая точка для вкладок).
	private _task?: Task

	/** Задача активной сессии. */
	get activeTask(): Task | undefined {
		return this._task
	}

	/** Сбрасывает ссылку на задачу без abort (для resetState; запись остаётся внутри Controller). */
	detachActiveTask(): void {
		this._task = undefined
	}

	/**
	 * SessionManager - управление сессиями (замена controller.task в будущем).
	 * Шаг 1: работает параллельно с this._task для обратной совместимости.
	 * Каждый initTask/clearTask синхронизирует текущую сессию с Task.
	 */
	readonly sessionManager = new SessionManager()

	mcpHub: McpHub
	readonly stateManager: StateManager

	// NEW: Add workspace manager (optional initially)
	private workspaceManager?: WorkspaceRootManager
	private backgroundCommandRunning = false
	private backgroundCommandTaskId?: string

	// Flag to prevent duplicate cancellations from spam clicking
	private cancelInProgress = false

	// Public getter for workspace manager with lazy initialization - To get workspaces when task isn't initialized (Used by file mentions)
	async ensureWorkspaceManager(): Promise<WorkspaceRootManager | undefined> {
		if (!this.workspaceManager) {
			try {
				this.workspaceManager = await setupWorkspaceManager({
					stateManager: this.stateManager,
					detectRoots: detectWorkspaceRoots,
				})
			} catch (error) {
				Logger.error("[Controller] Failed to initialize workspace manager:", error)
			}
		}
		return this.workspaceManager
	}

	// Synchronous getter for workspace manager
	getWorkspaceManager(): WorkspaceRootManager | undefined {
		return this.workspaceManager
	}

	constructor(readonly context: vscode.ExtensionContext) {
		PromptRegistry.getInstance() // Ensure prompts and tools are registered
		HostProvider.get().logToChannel("SkycodeProvider instantiated")
		this.stateManager = StateManager.get()
		StateManager.get().registerCallbacks({
			onPersistenceError: async ({ error }: PersistenceErrorEvent) => {
				// Just log - don't call reInitialize() (that sets isInitialized=false which
				// breaks running tasks) and don't show a warning (data is safe in memory
				// and will be retried automatically on the next debounced persistence).
				Logger.error("[Controller] Storage persistence failed (will retry):", error)
			},
			onSyncExternalChange: async () => {
				await this.postStateToWebview()
			},
		})
		// Migrate away from removed providers (Skycode, Bedrock, Vertex, OCA and others): fall back to OpenAI Compatible
		const initConfig = this.stateManager.getApiConfiguration()
		const known = new Set<string>(PROVIDERS.list.map((p) => p.value))
		const isRemoved = (p?: string) => !!p && !known.has(p)
		if (isRemoved(initConfig.planModeApiProvider) || isRemoved(initConfig.actModeApiProvider)) {
			const migrated = { ...initConfig }
			if (isRemoved(migrated.planModeApiProvider)) {
				migrated.planModeApiProvider = "openai" as ApiProvider
			}
			if (isRemoved(migrated.actModeApiProvider)) {
				migrated.actModeApiProvider = "openai" as ApiProvider
			}
			this.stateManager.setApiConfiguration(migrated)
		}

		this.mcpHub = new McpHub(
			() => ensureMcpServersDirectoryExists(),
			() => ensureSettingsDirectoryExists(),
			ExtensionRegistryInfo.version,
		)
	}

	/*
	VSCode extensions use the disposable pattern to clean up resources when the sidebar/editor tab is closed by the user or system. This applies to event listening, commands, interacting with the UI, etc.
	- https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/
	- https://github.com/microsoft/vscode-extension-samples/blob/main/webview-sample/src/extension.ts
	*/
	async dispose() {
		// [SKYCODE-PERF] Clear postState throttle timer + drain any pending resolvers
		// Otherwise the timer fires after dispose and tries to send state to a dead webview,
		// and pending promises stay forever in memory.
		if (this._postStateThrottleTimer) {
			clearTimeout(this._postStateThrottleTimer)
			this._postStateThrottleTimer = null
		}
		if (this._postStatePromiseResolvers.length > 0) {
			const resolvers = this._postStatePromiseResolvers
			this._postStatePromiseResolvers = []
			for (const r of resolvers) {
				r()
			}
		}
		this._postStatePending = false

		// [SKYCODE-PERF] Drop heavy caches so GC can collect them
		this._voiceReadyCache = null
		this._codexAuthCache = null
		this._lastDictationSettingsJson = ""

		await this.clearTask()
		this.mcpHub.dispose()

		Logger.error("Controller disposed")
	}

	async initTask(
		task?: string,
		images?: string[],
		files?: string[],
		historyItem?: HistoryItem,
		taskSettings?: Partial<Settings>,
	) {
		await this.clearTask() // ensures that an existing task doesn't exist before starting a new one, although this shouldn't be possible since user must clear task before starting a new one

		const autoApprovalSettings = this.stateManager.getGlobalSettingsKey("autoApprovalSettings")
		const shellIntegrationTimeout = this.stateManager.getGlobalSettingsKey("shellIntegrationTimeout")
		const terminalReuseEnabled = this.stateManager.getGlobalStateKey("terminalReuseEnabled")
		const vscodeTerminalExecutionMode = this.stateManager.getGlobalStateKey("vscodeTerminalExecutionMode")
		const terminalOutputLineLimit = this.stateManager.getGlobalSettingsKey("terminalOutputLineLimit")
		const defaultTerminalProfile = this.stateManager.getGlobalSettingsKey("defaultTerminalProfile")
		const isNewUser = this.stateManager.getGlobalStateKey("isNewUser")
		const taskHistory = this.stateManager.getGlobalStateKey("taskHistory")

		const NEW_USER_TASK_COUNT_THRESHOLD = 10

		// Check if the user has completed enough tasks to no longer be considered a "new user"
		if (isNewUser && !historyItem && taskHistory && taskHistory.length >= NEW_USER_TASK_COUNT_THRESHOLD) {
			this.stateManager.setGlobalState("isNewUser", false)
			await this.postStateToWebview()
		}

		if (autoApprovalSettings) {
			const updatedAutoApprovalSettings = {
				...autoApprovalSettings,
				version: (autoApprovalSettings.version ?? 1) + 1,
			}
			this.stateManager.setGlobalState("autoApprovalSettings", updatedAutoApprovalSettings)
		}

		// Initialize and persist the workspace manager (multi-root or single-root) with telemetry + fallback
		this.workspaceManager = await setupWorkspaceManager({
			stateManager: this.stateManager,
			detectRoots: detectWorkspaceRoots,
		})

		const cwd = this.workspaceManager?.getPrimaryRoot()?.path || (await getCwd(getDesktopDir()))

		const taskId = historyItem?.id || Date.now().toString()

		await this.stateManager.loadTaskSettings(taskId)
		if (taskSettings) {
			this.stateManager.setTaskSettingsBatch(taskId, taskSettings)
		}

		const newTask = new Task({
			controller: this,
			mcpHub: this.mcpHub,
			updateTaskHistory: (historyItem) => this.updateTaskHistory(historyItem),
			postStateToWebview: () => this.postStateToWebview(),
			reinitExistingTaskFromId: (taskId) => this.reinitExistingTaskFromId(taskId),
			cancelTask: () => this.cancelTask(),
			shellIntegrationTimeout,
			terminalReuseEnabled: terminalReuseEnabled ?? true,
			terminalOutputLineLimit: terminalOutputLineLimit ?? 500,
			defaultTerminalProfile: defaultTerminalProfile ?? "default",
			vscodeTerminalExecutionMode,
			cwd,
			stateManager: this.stateManager,
			workspaceManager: this.workspaceManager,
			task,
			images,
			files,
			historyItem,
			taskId,
		})
		this._task = newTask

		// --- SESSION SYNC: привязываем Task <-> Session двусторонне ---
		const session = this.sessionManager.create(taskId)
		session.setTask(newTask)
		newTask.setSession(session)

		// v4: привязываем DiffSystem к текущей задаче для scoped rollback
		try {
			const diffSystem = getDiffSystem()
			diffSystem.setCurrentTaskId(taskId)
		} catch {
			// DiffSystem may not be initialized yet
		}

		if (historyItem) {
			newTask.resumeTaskFromHistory()
		} else if (task || images || files) {
			newTask.startTask(task, images, files)
		}

		return newTask.taskId
	}

	async reinitExistingTaskFromId(taskId: string) {
		const history = await this.getTaskWithId(taskId)
		if (history) {
			await this.initTask(undefined, undefined, undefined, history.historyItem)
		}
	}

	async toggleActModeForYoloMode(): Promise<boolean> {
		const modeToSwitchTo: Mode = "act"

		// Switch to act mode
		this.stateManager.setGlobalState("mode", modeToSwitchTo)

		// Update API handler with new mode (buildApiHandler now selects provider based on mode)
		if (this.activeTask) {
			const apiConfiguration = this.stateManager.getApiConfiguration()
			this.activeTask.api = buildApiHandler({ ...apiConfiguration, ulid: this.activeTask.ulid }, modeToSwitchTo)
		}

		await this.postStateToWebview()

		// Additional safety
		if (this.activeTask) {
			return true
		}
		return false
	}

	async togglePlanActMode(modeToSwitchTo: Mode, chatContent?: ChatContent): Promise<boolean> {
		// Both "act" and "debug" modes have full tool access, so switching to either
		// should auto-approve a pending plan response
		const didSwitchToWriteMode = modeToSwitchTo === "act" || modeToSwitchTo === "debug"

		// Store mode to global state
		this.stateManager.setGlobalState("mode", modeToSwitchTo)

		// Capture mode switch telemetry | Capture regardless of if we know the taskId

		// Update API handler with new mode (buildApiHandler now selects provider based on mode)
		if (this.activeTask) {
			const apiConfiguration = this.stateManager.getApiConfiguration()
			this.activeTask.api = buildApiHandler({ ...apiConfiguration, ulid: this.activeTask.ulid }, modeToSwitchTo)
		}

		await this.postStateToWebview()

		if (this.activeTask) {
			if (this.activeTask.taskState.isAwaitingPlanResponse && didSwitchToWriteMode) {
				this.activeTask.taskState.didRespondToPlanAskBySwitchingMode = true
				// Use chatContent if provided, otherwise use default message
				await this.activeTask.handleWebviewAskResponse(
					"messageResponse",
					chatContent?.message || "PLAN_MODE_TOGGLE_RESPONSE",
					chatContent?.images || [],
					chatContent?.files || [],
				)

				return true
			} else {
				this.cancelTask()
				return false
			}
		}

		return false
	}

	async cancelTask() {
		// Prevent duplicate cancellations from spam clicking
		if (this.cancelInProgress) {
			Logger.log(`[Controller.cancelTask] Cancellation already in progress, ignoring duplicate request`)
			return
		}

		if (!this.activeTask) {
			return
		}

		// Set flag to prevent concurrent cancellations
		this.cancelInProgress = true

		try {
			this.updateBackgroundCommandState(false)

			try {
				await this.activeTask.abortTask()
			} catch (error) {
				Logger.error("Failed to abort task", error)
			}

			await pWaitFor(
				() =>
					this.activeTask === undefined ||
					this.activeTask.taskState.isStreaming === false ||
					this.activeTask.taskState.didFinishAbortingStream ||
					this.activeTask.taskState.isWaitingForFirstChunk,
				{
					timeout: 800,
				},
			).catch(() => {
				Logger.warn("[Controller.cancelTask] Timed out waiting for stream abort — force-continuing")
			})

			if (this.activeTask) {
				// 'abandoned' will prevent this skycode instance from affecting future skycode instance gui. this may happen if its hanging on a streaming request
				this.activeTask.taskState.abandoned = true
			}

			// Small delay to ensure state manager has persisted the history update
			//await new Promise((resolve) => setTimeout(resolve, 100))

			// NOW try to get history after abort has finished (hook may have saved messages)
			let historyItem: HistoryItem | undefined
			try {
				const result = await this.getTaskWithId(this.activeTask.taskId)
				historyItem = result.historyItem
			} catch (error) {
				// Task not in history yet (new task with no messages); catch the
				// error to enable the agent to continue making progress.
				Logger.log(`[Controller.cancelTask] Task not found in history: ${error}`)
			}

			// Only re-initialize if we found a history item, otherwise just clear
			if (historyItem) {
				// Re-initialize task to keep it visible in UI with resume button
				await this.initTask(undefined, undefined, undefined, historyItem, undefined)
			} else {
				await this.clearTask()
			}

			await this.postStateToWebview()
		} finally {
			// Always clear the flag, even if cancellation fails
			this.cancelInProgress = false
		}
	}

	updateBackgroundCommandState(running: boolean, taskId?: string) {
		const nextTaskId = running ? taskId : undefined
		if (this.backgroundCommandRunning === running && this.backgroundCommandTaskId === nextTaskId) {
			return
		}
		this.backgroundCommandRunning = running
		this.backgroundCommandTaskId = nextTaskId
		void this.postStateToWebview()
	}

	async cancelBackgroundCommand(): Promise<void> {
		const didCancel = await this.activeTask?.cancelBackgroundCommand()
		if (!didCancel) {
			this.updateBackgroundCommandState(false)
		}
	}

	async handleMcpOAuthCallback(serverHash: string, code: string, state: string | null) {
		try {
			await this.mcpHub.completeOAuth(serverHash, code, state)
			await this.postStateToWebview()
			HostProvider.window.showMessage({
				type: ShowMessageType.INFORMATION,
				message: t("mcp.authSuccess"),
			})
		} catch (error) {
			Logger.error("Failed to complete MCP OAuth:", error)
			HostProvider.window.showMessage({
				type: ShowMessageType.ERROR,
				message: t("mcp.authFailed"),
			})
		}
	}

	async handleTaskCreation(prompt: string) {
		await sendChatButtonClickedEvent()
		await this.initTask(prompt)
	}

	// MCP Marketplace
	private async fetchMcpMarketplaceFromApi(): Promise<McpMarketplaceCatalog> {
		// [SKYCODE] Только встроенный каталог. API маркетплейса на skycode-ai.ru не отвечает, а запрос
		// к нему держал вкладку MCP по 5 секунд до перехода на этот же каталог.
		const catalogPath = path.join(__dirname, "assets", "mcp-marketplace-catalog.json")
		const rawItems: McpMarketplaceItem[] = JSON.parse(await fs.readFile(catalogPath, "utf-8"))

		if (!Array.isArray(rawItems)) {
			throw new Error("Invalid MCP marketplace catalog data")
		}

		const items: McpMarketplaceItem[] = rawItems.map((item: McpMarketplaceItem) => ({
			...item,
			githubStars: item.githubStars ?? 0,
			downloadCount: item.downloadCount ?? 0,
			tags: item.tags ?? [],
		}))

		const catalog: McpMarketplaceCatalog = { items }

		// Store in cache file
		await writeMcpMarketplaceCatalogToCache(catalog)
		return catalog
	}

	async refreshMcpMarketplace(sendCatalogEvent: boolean): Promise<McpMarketplaceCatalog | undefined> {
		try {
			const catalog = await this.fetchMcpMarketplaceFromApi()
			if (catalog && sendCatalogEvent) {
				await sendMcpMarketplaceCatalogEvent(catalog)
			}
			return catalog
		} catch (error) {
			Logger.error("Failed to refresh MCP marketplace:", error)
			return undefined
		}
	}

	// OpenRouter

	async handleOpenRouterCallback(code: string) {
		let apiKey: string
		try {
			const response = await axios.post("https://openrouter.ai/api/v1/auth/keys", { code }, getAxiosSettings())
			if (response.data && response.data.key) {
				apiKey = response.data.key
			} else {
				throw new Error("Invalid response from OpenRouter API")
			}
		} catch (error) {
			Logger.error("Error exchanging code for API key:", error)
			throw error
		}

		const openrouter: ApiProvider = "openrouter"
		const currentMode = this.stateManager.getGlobalSettingsKey("mode")

		// Update API configuration through cache service
		const currentApiConfiguration = this.stateManager.getApiConfiguration()
		const updatedConfig = {
			...currentApiConfiguration,
			planModeApiProvider: openrouter,
			actModeApiProvider: openrouter,
			openRouterApiKey: apiKey,
		}
		this.stateManager.setApiConfiguration(updatedConfig)

		await this.postStateToWebview()
		if (this.activeTask) {
			this.activeTask.api = buildApiHandler({ ...updatedConfig, ulid: this.activeTask.ulid }, currentMode)
		}
		// Dont send settingsButtonClicked because its bad ux if user is on welcome
	}

	// Read OpenRouter models from disk cache
	async readOpenRouterModels(): Promise<Record<string, ModelInfo> | undefined> {
		const openRouterModelsFilePath = path.join(await ensureCacheDirectoryExists(), GlobalFileNames.openRouterModels)
		try {
			if (await fileExistsAtPath(openRouterModelsFilePath)) {
				const fileContents = await fs.readFile(openRouterModelsFilePath, "utf8")
				const models = JSON.parse(fileContents)
				// Append stealth models
				return appendSkycodeStealthModels(models)
			}
		} catch (error) {
			Logger.error("Error reading cached OpenRouter models:", error)
		}
		return undefined
	}

	// Task history

	async getTaskWithId(id: string): Promise<{
		historyItem: HistoryItem
		taskDirPath: string
		apiConversationHistoryFilePath: string
		uiMessagesFilePath: string
		contextHistoryFilePath: string
		taskMetadataFilePath: string
		apiConversationHistory: Anthropic.MessageParam[]
	}> {
		const history = this.stateManager.getGlobalStateKey("taskHistory")
		const historyItem = history.find((item) => item.id === id)
		if (historyItem) {
			const taskDirPath = path.join(HostProvider.get().globalStorageFsPath, "tasks", id)
			const apiConversationHistoryFilePath = path.join(taskDirPath, GlobalFileNames.apiConversationHistory)
			const uiMessagesFilePath = path.join(taskDirPath, GlobalFileNames.uiMessages)
			const contextHistoryFilePath = path.join(taskDirPath, GlobalFileNames.contextHistory)
			const taskMetadataFilePath = path.join(taskDirPath, GlobalFileNames.taskMetadata)
			const fileExists = await fileExistsAtPath(apiConversationHistoryFilePath)
			if (fileExists) {
				const apiConversationHistory = JSON.parse(await fs.readFile(apiConversationHistoryFilePath, "utf8"))
				return {
					historyItem,
					taskDirPath,
					apiConversationHistoryFilePath,
					uiMessagesFilePath,
					contextHistoryFilePath,
					taskMetadataFilePath,
					apiConversationHistory,
				}
			}
		}
		// if we tried to get a task that doesn't exist, remove it from state
		// FIXME: this seems to happen sometimes when the json file doesn't save to disk for some reason
		await this.deleteTaskFromState(id)
		throw new Error("Task not found")
	}

	async exportTaskWithId(id: string) {
		const { taskDirPath } = await this.getTaskWithId(id)
		Logger.log(`[EXPORT] Opening task directory: ${taskDirPath}`)
		await open(taskDirPath)
	}

	async deleteTaskFromState(id: string) {
		// Remove the task from history
		const taskHistory = this.stateManager.getGlobalStateKey("taskHistory")
		const updatedTaskHistory = taskHistory.filter((task) => task.id !== id)
		this.stateManager.setGlobalState("taskHistory", updatedTaskHistory)

		// Notify the webview that the task has been deleted
		await this.postStateToWebview()

		return updatedTaskHistory
	}

	// [SKYCODE-PERF] Throttle postStateToWebview to prevent extension host overload.
	// Multiple callers (indexing, task updates, settings changes) can trigger this
	// dozens of times per second. We coalesce into at most one call per 300ms.
	private _postStateThrottleTimer: ReturnType<typeof setTimeout> | null = null
	private _postStatePending = false
	private _postStatePromiseResolvers: Array<() => void> = []

	async postStateToWebview() {
		// If a throttled call is already pending, just mark that we need another update
		if (this._postStateThrottleTimer) {
			this._postStatePending = true
			return new Promise<void>((resolve) => {
				this._postStatePromiseResolvers.push(resolve)
			})
		}

		// Execute immediately
		await this._doPostStateToWebview()

		// Set up throttle window — any calls during this window will be coalesced
		this._postStateThrottleTimer = setTimeout(async () => {
			this._postStateThrottleTimer = null
			if (this._postStatePending) {
				this._postStatePending = false
				const resolvers = this._postStatePromiseResolvers
				this._postStatePromiseResolvers = []
				await this._doPostStateToWebview()
				for (const r of resolvers) {
					r()
				}
			}
		}, 300)
	}

	private async _doPostStateToWebview() {
		const state = await this.getStateToPostToWebview()
		await sendStateUpdate(state)
	}

	// [SKYCODE-PERF] Cache voice readiness to avoid 3× fs.existsSync on every state push.
	// Invalidated only when dictation settings change or on explicit refresh.
	private _voiceReadyCache: { ready: boolean; model: string; checkedAt: number } | null = null
	private _lastDictationSettingsJson = ""

	private _checkVoiceReadiness(dictationSettings: any): boolean {
		const selectedModel = dictationSettings?.whisperModel ?? "tiny"
		const settingsJson = JSON.stringify({ model: selectedModel, downloading: dictationSettings?.voiceDownloading })

		// Return cached value if settings haven't changed and cache is fresh (< 10s)
		if (
			this._voiceReadyCache &&
			this._lastDictationSettingsJson === settingsJson &&
			Date.now() - this._voiceReadyCache.checkedAt < 10_000
		) {
			return this._voiceReadyCache.ready
		}

		const _fs = require("fs") as typeof import("fs")
		const _path = require("path") as typeof import("path")
		const whisperDir = _path.join(HostProvider.get().globalStorageFsPath, "whisper")
		const modelFileMap: Record<string, string> = { tiny: "ggml-tiny.bin", base: "ggml-base.bin", small: "ggml-small.bin" }
		const modelFile = modelFileMap[selectedModel] || "ggml-base.bin"
		const binaryName = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"
		const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"

		const hasModel = _fs.existsSync(_path.join(whisperDir, modelFile))
		const hasBinary = _fs.existsSync(_path.join(whisperDir, binaryName))
		const hasFfmpeg = _fs.existsSync(_path.join(whisperDir, ffmpegName))
		const voiceReady = hasModel && hasBinary && hasFfmpeg

		this._voiceReadyCache = { ready: voiceReady, model: selectedModel, checkedAt: Date.now() }
		this._lastDictationSettingsJson = settingsJson
		return voiceReady
	}

	// [SKYCODE-PERF] Cache OpenAI Codex auth status (refreshed at most every 30s)
	private _codexAuthCache: { authenticated: boolean; checkedAt: number } | null = null

	private async _getCodexAuthStatus(): Promise<boolean> {
		if (this._codexAuthCache && Date.now() - this._codexAuthCache.checkedAt < 30_000) {
			return this._codexAuthCache.authenticated
		}
		try {
			const { openAiCodexOAuthManager } = await import("@/integrations/openai-codex/oauth")
			const authenticated = await openAiCodexOAuthManager.isAuthenticated()
			this._codexAuthCache = { authenticated, checkedAt: Date.now() }
			return authenticated
		} catch {
			return this._codexAuthCache?.authenticated ?? false
		}
	}

	// [SKYCODE-PERF] Initialize WhisperLocalService once, not on every state push
	private _whisperInitialized = false

	private async _ensureWhisperInitialized(selectedModel: string): Promise<void> {
		if (this._whisperInitialized) {
			return
		}
		try {
			const { getWhisperLocalService } = await import("@/services/dictation/WhisperLocalService")
			getWhisperLocalService(HostProvider.get().globalStorageFsPath, selectedModel, HostProvider.get().extensionFsPath)
			this._whisperInitialized = true
		} catch (err) {
			Logger.warn("Failed to initialize WhisperLocalService:", err)
		}
	}

	async getStateToPostToWebview(): Promise<ExtensionState> {
		// [SKYCODE-SKYCODE] Capture indexing progress IMMEDIATELY before any awaits.
		// getStateToPostToWebview has multiple awaits (getBanners, openAiCodex, etc.)
		// that yield to the event loop. During those yields, indexing continues and
		// progress advances. If we read progress after the awaits, we miss intermediate states.
		let indexingProgressSnapshot: import("@shared/IndexingTypes").IndexingProgress | undefined
		try {
			const { getIndexingProgress } = require("../indexing/progressCache")
			indexingProgressSnapshot =
				getIndexingProgress() ?? this.context.workspaceState.get("skycode.indexingProgress") ?? undefined
		} catch {
			indexingProgressSnapshot = this.context.workspaceState.get("skycode.indexingProgress") ?? undefined
		}

		// Get API configuration from cache for immediate access
		const onboardingModels = getSkycodeOnboardingModels()
		const apiConfiguration = this.stateManager.getApiConfiguration()
		const lastShownAnnouncementId = this.stateManager.getGlobalStateKey("lastShownAnnouncementId")
		const taskHistory = this.stateManager.getGlobalStateKey("taskHistory")
		const autoApprovalSettings = this.stateManager.getGlobalSettingsKey("autoApprovalSettings")
		const browserSettings = this.stateManager.getGlobalSettingsKey("browserSettings")
		const focusChainSettings = this.stateManager.getGlobalSettingsKey("focusChainSettings")
		const dictationSettings = this.stateManager.getGlobalSettingsKey("dictationSettings")
		const preferredLanguage = this.stateManager.getGlobalSettingsKey("preferredLanguage")
		// Sync backend i18n locale on every state push (covers startup + runtime changes)
		if (preferredLanguage) {
			setBackendLocale(getBackendLocaleForPreferredLanguage(preferredLanguage))
		}
		const alwaysThinkInPreferredLanguage = this.stateManager.getGlobalSettingsKey("alwaysThinkInPreferredLanguage")
		const openaiReasoningEffort = this.stateManager.getGlobalSettingsKey("openaiReasoningEffort")
		const mode = this.stateManager.getGlobalSettingsKey("mode")
		const strictPlanModeEnabled = this.stateManager.getGlobalSettingsKey("strictPlanModeEnabled")
		const yoloModeToggled = this.stateManager.getGlobalSettingsKey("yoloModeToggled")
		const useAutoCondense = this.stateManager.getGlobalSettingsKey("useAutoCondense")
		const mcpDisplayMode = this.stateManager.getGlobalStateKey("mcpDisplayMode")
		const planActSeparateModelsSetting = this.stateManager.getGlobalSettingsKey("planActSeparateModelsSetting")
		const globalSkycodeRulesToggles = this.stateManager.getGlobalSettingsKey("globalSkycodeRulesToggles")
		const globalWorkflowToggles = this.stateManager.getGlobalSettingsKey("globalWorkflowToggles")
		const globalSkillsToggles = this.stateManager.getGlobalSettingsKey("globalSkillsToggles")
		const localSkillsToggles = this.stateManager.getWorkspaceStateKey("localSkillsToggles")
		const shellIntegrationTimeout = this.stateManager.getGlobalSettingsKey("shellIntegrationTimeout")
		const terminalReuseEnabled = this.stateManager.getGlobalStateKey("terminalReuseEnabled")
		const vscodeTerminalExecutionMode = this.stateManager.getGlobalStateKey("vscodeTerminalExecutionMode")
		const defaultTerminalProfile = this.stateManager.getGlobalSettingsKey("defaultTerminalProfile")
		const isNewUser = this.stateManager.getGlobalStateKey("isNewUser")
		// Can be undefined but is set to either true or false by the migration that runs on extension launch in extension.ts
		const welcomeViewCompleted = true // !!this.stateManager.getGlobalStateKey("welcomeViewCompleted")

		const customPrompt = this.stateManager.getGlobalSettingsKey("customPrompt")
		const mcpResponsesCollapsed = this.stateManager.getGlobalStateKey("mcpResponsesCollapsed")
		const terminalOutputLineLimit = this.stateManager.getGlobalSettingsKey("terminalOutputLineLimit")
		const maxConsecutiveMistakes = this.stateManager.getGlobalSettingsKey("maxConsecutiveMistakes")
		const favoritedModelIds = this.stateManager.getGlobalStateKey("favoritedModelIds")
		const lastDismissedInfoBannerVersion = this.stateManager.getGlobalStateKey("lastDismissedInfoBannerVersion") || 0
		const lastDismissedModelBannerVersion = this.stateManager.getGlobalStateKey("lastDismissedModelBannerVersion") || 0
		const skillsEnabled = this.stateManager.getGlobalSettingsKey("skillsEnabled")

		const localSkycodeRulesToggles = this.stateManager.getWorkspaceStateKey("localSkycodeRulesToggles")
		const localWindsurfRulesToggles = this.stateManager.getWorkspaceStateKey("localWindsurfRulesToggles")
		const localCursorRulesToggles = this.stateManager.getWorkspaceStateKey("localCursorRulesToggles")
		const localAgentsRulesToggles = this.stateManager.getWorkspaceStateKey("localAgentsRulesToggles")
		const workflowToggles = this.stateManager.getWorkspaceStateKey("workflowToggles")
		const autoCondenseThreshold = this.stateManager.getGlobalSettingsKey("autoCondenseThreshold")

		const currentTaskItem = this.activeTask?.taskId
			? (taskHistory || []).find((item) => item.id === this.activeTask?.taskId)
			: undefined
		const skycodeMessages = (this.activeTask?.messageStateHandler.getSkycodeMessages() || []).map(
			sanitizeTruncatedPlaceholder,
		)
		const currentSessionId = this.sessionManager.activeSessionId ?? undefined

		const processedTaskHistory = (taskHistory || [])
			.filter((item) => item.ts && item.task)
			.sort((a, b) => b.ts - a.ts)
			.slice(0, 100) // for now we're only getting the latest 100 tasks, but a better solution here is to only pass in 3 for recent task history, and then get the full task history on demand when going to the task history view (maybe with pagination?)

		const latestAnnouncementId = getLatestAnnouncementId()
		const shouldShowAnnouncement = lastShownAnnouncementId !== latestAnnouncementId
		const platform = process.platform as Platform
		const distinctId = getDistinctId()
		const version = ExtensionRegistryInfo.version
		const environment = SkycodeEnv.config().environment
		const banners = await this.getBanners()

		// [SKYCODE-PERF] Use cached auth status instead of dynamic import + async check on every call
		const openAiCodexIsAuthenticated = await this._getCodexAuthStatus()

		// [SKYCODE-PERF] Voice readiness — cached, no fs.existsSync on every call
		const selectedModel = (dictationSettings as any)?.whisperModel ?? "tiny"

		// Initialize WhisperLocalService once (not on every state push)
		void this._ensureWhisperInitialized(selectedModel)

		// Reset transient download flags on startup (they don't survive restarts)
		if ((dictationSettings as any).voiceDownloading) {
			this.stateManager.setGlobalState("dictationSettings", {
				...dictationSettings,
				voiceDownloading: false,
				voiceDownloadProgress: 0,
				voiceReinstall: false,
			})
		}

		const voiceReady = this._checkVoiceReadiness(dictationSettings)

		const updatedDictationSettings = {
			...dictationSettings,
			featureEnabled: true,
			voiceReady,
			voiceDownloading: (dictationSettings as any).voiceDownloading ?? false,
			whisperModel: selectedModel,
		}

		return {
			version,
			apiConfiguration,
			currentTaskItem,
			currentSessionId,
			skycodeMessages,
			currentFocusChainChecklist: this.activeTask?.taskState.currentFocusChainChecklist || null,
			autoApprovalSettings,
			browserSettings,
			focusChainSettings,
			dictationSettings: updatedDictationSettings,
			preferredLanguage,
			alwaysThinkInPreferredLanguage,
			openaiReasoningEffort,
			mode,
			strictPlanModeEnabled,
			yoloModeToggled,
			useAutoCondense,
			mcpDisplayMode,
			planActSeparateModelsSetting,
			platform,
			environment,
			distinctId,
			globalSkycodeRulesToggles: globalSkycodeRulesToggles || {},
			localSkycodeRulesToggles: localSkycodeRulesToggles || {},
			localWindsurfRulesToggles: localWindsurfRulesToggles || {},
			localCursorRulesToggles: localCursorRulesToggles || {},
			localAgentsRulesToggles: localAgentsRulesToggles || {},
			localWorkflowToggles: workflowToggles || {},
			globalWorkflowToggles: globalWorkflowToggles || {},
			globalSkillsToggles: globalSkillsToggles || {},
			localSkillsToggles: localSkillsToggles || {},
			shellIntegrationTimeout,
			terminalReuseEnabled,
			vscodeTerminalExecutionMode: vscodeTerminalExecutionMode,
			defaultTerminalProfile,
			isNewUser,
			welcomeViewCompleted,
			onboardingModels,
			mcpResponsesCollapsed,
			terminalOutputLineLimit,
			maxConsecutiveMistakes,
			customPrompt,
			taskHistory: processedTaskHistory,
			shouldShowAnnouncement,
			favoritedModelIds,
			autoCondenseThreshold,
			backgroundCommandRunning: this.backgroundCommandRunning,
			backgroundCommandTaskId: this.backgroundCommandTaskId,
			// NEW: Add workspace information
			workspaceRoots: this.workspaceManager?.getRoots() ?? [],
			primaryRootIndex: this.workspaceManager?.getPrimaryIndex() ?? 0,
			isMultiRootWorkspace: (this.workspaceManager?.getRoots().length ?? 0) > 1,
			multiRootSetting: {
				user: this.stateManager.getGlobalStateKey("multiRootEnabled"),
				featureFlag: true, // Multi-root workspace is now always enabled
			},
			skycodeWebToolsEnabled: {
				user: this.stateManager.getGlobalSettingsKey("skycodeWebToolsEnabled"),
				featureFlag: true, // Web tools are always available, gated by authentication
			},
			hooksEnabled: getHooksEnabledSafe(),
			lastDismissedInfoBannerVersion,
			lastDismissedModelBannerVersion,
			nativeToolCallSetting: this.stateManager.getGlobalStateKey("nativeToolCallEnabled"),
			enableParallelToolCalling: this.stateManager.getGlobalSettingsKey("enableParallelToolCalling"),
			backgroundEditEnabled: this.stateManager.getGlobalSettingsKey("backgroundEditEnabled"),
			skillsEnabled,
			// Skycode AI: Lightweight mode for weak models
			lightweightMode: this.stateManager.getGlobalSettingsKey("lightweightMode"),
			// Skycode AI: Session budget — tier override + custom limits
			sessionBudgetMode: this.stateManager.getGlobalSettingsKey("sessionBudgetMode"),
			customMaxToolCallsPerTurn: this.stateManager.getGlobalSettingsKey("customMaxToolCallsPerTurn"),
			customMaxConsecutiveReadOnlyTools: this.stateManager.getGlobalSettingsKey("customMaxConsecutiveReadOnlyTools"),
			customForceCompactAfterSteps: this.stateManager.getGlobalSettingsKey("customForceCompactAfterSteps"),
			// Skycode AI: Active prompt profile (variant + tier + limits)
			promptProfile: (() => {
				try {
					const apiConfig = this.stateManager.getApiConfiguration()
					const mode = this.stateManager.getGlobalSettingsKey("mode")
					const isPlan = getApiSettingsMode(mode) === "plan"
					const providerId = (isPlan ? apiConfig.planModeApiProvider : apiConfig.actModeApiProvider) as string
					const modeKey = isPlan ? "planMode" : "actMode"
					const providerModelSuffix: Record<string, string> = {
						openrouter: "OpenRouterModelId",
						openai: "OpenAiModelId",
						ollama: "OllamaModelId",
						lmstudio: "LmStudioModelId",
						litellm: "LiteLlmModelId",
					}
					const configModelId = (apiConfig as Record<string, unknown>)[
						`${modeKey}${providerModelSuffix[providerId] ?? "ApiModelId"}`
					] as string | undefined
					const modelId = this.activeTask?.api?.getModel()?.id ?? configModelId ?? "unknown"
					const providerInfo = { model: { id: modelId, info: {} as ModelInfo }, providerId, mode }
					// Read user's session budget override (auto / strong / medium / weak / custom).
					// Without this, the prompt profile pill always shows the auto-detected tier
					// even after the user explicitly chose a different one in Settings.
					const sessionBudgetMode = this.stateManager.getGlobalSettingsKey("sessionBudgetMode") ?? "auto"
					const customSettings = {
						sessionBudgetMode,
						customMaxToolCallsPerTurn: this.stateManager.getGlobalSettingsKey("customMaxToolCallsPerTurn") ?? 80,
						customMaxConsecutiveReadOnlyTools:
							this.stateManager.getGlobalSettingsKey("customMaxConsecutiveReadOnlyTools") ?? 12,
						customForceCompactAfterSteps:
							this.stateManager.getGlobalSettingsKey("customForceCompactAfterSteps") ?? 40,
					}
					const tierOverride =
						sessionBudgetMode === "strong" || sessionBudgetMode === "medium" || sessionBudgetMode === "weak"
							? sessionBudgetMode
							: "auto"
					const detectedTier = getModelCapabilityTier(modelId, providerInfo, tierOverride)
					const limits = getSessionLimitsForModel(modelId, providerInfo, customSettings)
					// Show "custom" explicitly in the UI when limits are user-defined.
					const tier = sessionBudgetMode === "custom" ? "custom" : detectedTier
					const registry = PromptRegistry.getInstance()
					const variant = registry.getModelFamily({
						providerInfo,
						lightweightMode: this.stateManager.getGlobalSettingsKey("lightweightMode") === true,
					} as any)
					return {
						variant,
						tier,
						maxToolCalls: limits.maxToolCallsPerTurn,
						maxReadOnly: limits.maxConsecutiveReadOnlyTools,
						compactEvery: limits.forceCompactAfterSteps,
					}
				} catch {
					return undefined
				}
			})(),
			// Skycode AI: Edit tools settings
			validateSyntaxBeforeApply: vscode.workspace
				.getConfiguration("skycode")
				.get<boolean>("validateSyntaxBeforeApply", false),
			blockOnSyntaxErrors: vscode.workspace.getConfiguration("skycode").get<boolean>("blockOnSyntaxErrors", false),
			// Skycode AI: Codebase indexing config (read from VS Code settings)
			indexingConfig: (() => {
				const cfg = vscode.workspace.getConfiguration("skycode.indexing")
				return {
					mode: cfg.get("mode", DEFAULT_INDEXING_CONFIG.mode) as IndexingMode,
					localModel: cfg.get<LocalModelId>("localModel", DEFAULT_INDEXING_CONFIG.localModel),
					remoteApiUrl: cfg.get("remoteApiUrl", DEFAULT_INDEXING_CONFIG.remoteApiUrl),
					remoteApiKey: cfg.get("remoteApiKey", DEFAULT_INDEXING_CONFIG.remoteApiKey),
					remoteModel: cfg.get("remoteModel", DEFAULT_INDEXING_CONFIG.remoteModel),
					maxFileSize: cfg.get("maxFileSize", DEFAULT_INDEXING_CONFIG.maxFileSize),
					ignoredPatterns: cfg.get("ignoredPatterns", DEFAULT_INDEXING_CONFIG.ignoredPatterns),
				} satisfies IndexingConfig
			})(),
			// allow-any-unicode-next-line
			// Indexing progress — captured at start of function before any awaits (see top of getStateToPostToWebview)
			indexingProgress: indexingProgressSnapshot,
			indexingPromptDismissed: this.context.globalState.get<boolean>("skycode.indexingPromptDismissed", false),
			// Skycode AI: Pending changes for inline diffs
			pendingChanges: this.getPendingChangesInfo(),
			banners,
			openAiCodexIsAuthenticated,
		}
	}

	/**
	 * Get pending changes info for webview display
	 */
	private getPendingChangesInfo(): PendingChangeInfo[] {
		try {
			const storage = getPendingChangesStorage()
			// [SKYCODE] Бар внизу показывает изменения ТЕКУЩЕЙ задачи. Раньше он брал все правки
			// workspace, поэтому в новой вкладке висели файлы, изменённые агентом в прошлой.
			const fileStats = storage.getFileStats(this.activeTask?.taskId)
			return fileStats.map((stats) => ({
				id: stats.fsPath, // Use fsPath as id for grouping
				fileName: stats.fileName,
				fsPath: stats.fsPath,
				addedCount: stats.addedCount,
				removedCount: stats.removedCount,
			}))
		} catch {
			return []
		}
	}

	async clearTask() {
		if (this.activeTask) {
			// Clear task settings cache when task ends
			await this.stateManager.clearTaskSettings()
		}
		await this.activeTask?.abortTask()
		this._task = undefined // removes reference to it, so once promises end it will be garbage collected

		// v4: завершаем текущий checkpoint при переключении задач
		try {
			const diffSystem = getDiffSystem()
			await diffSystem.finishCheckpoint()
			// [SKYCODE] И снимаем привязку: до этого currentTaskId оставался от закрытой задачи,
			// так что правки, сделанные между задачами (например inline edit), уезжали в её бар.
			diffSystem.setCurrentTaskId(null)
		} catch {
			// DiffSystem may not be initialized
		}

		// --- SESSION SYNC: очищаем текущую сессию ---
		this.sessionManager.clearCurrent()
	}

	// Caching mechanism to keep track of webview messages + API conversation history per provider instance

	/*
	Now that we use retainContextWhenHidden, we don't have to store a cache of skycode messages in the user's state, but we could to reduce memory footprint in long conversations.

	- We have to be careful of what state is shared between SkycodeProvider instances since there could be multiple instances of the extension running at once. For example when we cached skycode messages using the same key, two instances of the extension could end up using the same key and overwriting each other's messages.
	- Some state does need to be shared between the instances, i.e. the API key--however there doesn't seem to be a good way to notify the other instances that the API key has changed.

	We need to use a unique identifier for each SkycodeProvider instance's message cache since we could be running several instances of the extension outside of just the sidebar i.e. in editor panels.

	// conversation history to send in API requests

	/*
	It seems that some API messages do not comply with vscode state requirements. Either the Anthropic library is manipulating these values somehow in the backend in a way that's creating cyclic references, or the API returns a function or a Symbol as part of the message content.
	// allow-any-unicode-next-line
	VSCode docs about state: "The value must be JSON-stringifyable ... value — A value. MUST not contain cyclic references."
	For now we'll store the conversation history in memory, and if we need to store in state directly we'd need to do a manual conversion to ensure proper json stringification.
	*/

	async updateTaskHistory(item: HistoryItem): Promise<HistoryItem[]> {
		const history = this.stateManager.getGlobalStateKey("taskHistory")
		const existingItemIndex = history.findIndex((h) => h.id === item.id)
		if (existingItemIndex !== -1) {
			history[existingItemIndex] = item
		} else {
			history.push(item)
		}
		this.stateManager.setGlobalState("taskHistory", history)
		return history
	}

	async getBanners(): Promise<BannerCardData[]> {
		return []
	}
}
