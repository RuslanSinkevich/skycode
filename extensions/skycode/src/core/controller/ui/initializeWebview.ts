import { Empty, EmptyRequest } from "@shared/proto/skycode/common"
import { OpenRouterCompatibleModelInfo } from "@shared/proto/skycode/models"
import { readMcpMarketplaceCatalogFromCache } from "@/core/storage/disk"
import { Logger } from "@/shared/services/Logger"
import { GlobalStateAndSettings } from "@/shared/storage/state-keys"
import type { Controller } from "../index"
import { sendMcpMarketplaceCatalogEvent } from "../mcp/subscribeToMcpMarketplaceCatalog"
import { refreshLiteLlmModels } from "../models/refreshLiteLlmModels"
import { refreshOpenRouterModels } from "../models/refreshOpenRouterModels"
import { sendOpenRouterModelsEvent } from "../models/subscribeToOpenRouterModels"

/**
 * Initialize webview when it launches
 * @param controller The controller instance
 * @param request The empty request
 * @returns Empty response
 */
export async function initializeWebview(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	try {
		// Post last cached models as soon as possible for immediate availability in the UI
		const lastCachedModels = await controller.readOpenRouterModels()
		if (lastCachedModels) {
			sendOpenRouterModelsEvent(OpenRouterCompatibleModelInfo.create({ models: lastCachedModels }))
		}

		// [SKYCODE] Списки моделей тянулись при каждом открытии панели у всех провайдеров сразу,
		// даже если пользователь ими не пользуется — в логах это десятки ошибок сети подряд.
		// Обновляем только то, что реально настроено; вебвью сам дозапросит список, когда
		// пользователь откроет соответствующего провайдера в настройках.
		// Пропуск оформлен как пустой промис, чтобы не переписывать тела обработчиков: они и так
		// ничего не делают, когда моделей нет.
		const apiConfig = controller.stateManager.getApiConfiguration()
		const usesProvider = (...providers: string[]): boolean =>
			providers.includes(apiConfig.planModeApiProvider as string) ||
			providers.includes(apiConfig.actModeApiProvider as string)
		const skipRefresh = Promise.resolve(undefined)

		// Refresh OpenRouter models from API
		;(usesProvider("openrouter") ? refreshOpenRouterModels(controller) : skipRefresh).then(async (models) => {
			if (models && Object.keys(models).length > 0) {
				// Update model info in state (this needs to be done here since we don't want to update state while settings is open, and we may refresh models there)
				const apiConfiguration = controller.stateManager.getApiConfiguration()
				const planActSeparateModelsSetting = controller.stateManager.getGlobalSettingsKey("planActSeparateModelsSetting")
				const currentMode = controller.getCurrentMode()

				if (planActSeparateModelsSetting) {
					// Separate models: update only current mode
					const modelIdField = currentMode === "plan" ? "planModeOpenRouterModelId" : "actModeOpenRouterModelId"
					const modelInfoField = currentMode === "plan" ? "planModeOpenRouterModelInfo" : "actModeOpenRouterModelInfo"
					const modelId = apiConfiguration[modelIdField]

					if (modelId && models[modelId]) {
						controller.stateManager.setGlobalState(modelInfoField, models[modelId])
						await controller.postStateToWebview()
					}
				} else {
					// Shared models: update both plan and act modes
					const planModelId = apiConfiguration.planModeOpenRouterModelId
					const actModelId = apiConfiguration.actModeOpenRouterModelId
					const updates: Partial<GlobalStateAndSettings> = {}

					// Update plan mode model info if we have a model ID
					if (planModelId && models[planModelId]) {
						updates.planModeOpenRouterModelInfo = models[planModelId]
					}

					// Update act mode model info if we have a model ID
					if (actModelId && models[actModelId]) {
						updates.actModeOpenRouterModelInfo = models[actModelId]
					}

					// Post state update if we updated any model info
					if (Object.keys(updates).length > 0) {
						controller.stateManager.setGlobalStateBatch(updates)
						await controller.postStateToWebview()
					}
				}
			}
		})

		const liteLlmBaseUrl = controller.stateManager.getGlobalSettingsKey("liteLlmBaseUrl")
		const liteLlmApiKey = controller.stateManager.getSecretKey("liteLlmApiKey")
		if (liteLlmBaseUrl && liteLlmApiKey) {
			await refreshLiteLlmModels()
		}

		// GUI relies on model info to be up-to-date to provide the most accurate pricing, so we need to fetch the latest details on launch.
		// We do this for all users since many users switch between api providers and if they were to switch back to openrouter it would be showing outdated model info if we hadn't retrieved the latest at this point
		// (see normalizeApiConfiguration > openrouter)
		// Prefetch marketplace and OpenRouter models

		// Send stored MCP marketplace catalog if available
		const mcpMarketplaceCatalog = await readMcpMarketplaceCatalogFromCache()

		if (mcpMarketplaceCatalog) {
			sendMcpMarketplaceCatalogEvent(mcpMarketplaceCatalog)
		}

		// Silently refresh MCP marketplace catalog
		controller.refreshMcpMarketplace(true /* sendCatalogEvent */)

		return Empty.create({})
	} catch (error) {
		Logger.error("Failed to initialize webview:", error)
		// Return empty response even on error to not break the frontend
		return Empty.create({})
	}
}
