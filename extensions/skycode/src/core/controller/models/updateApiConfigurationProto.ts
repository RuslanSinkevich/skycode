import { Empty } from "@shared/proto/skycode/common"
import { UpdateApiConfigurationRequest } from "@shared/proto/skycode/models"
import { convertProtoToApiProvider } from "@shared/proto-conversions/models/api-configuration-conversion"
import {
	fromProtobufLiteLLMModelInfo,
	fromProtobufModelInfo,
	fromProtobufOpenAiCompatibleModelInfo,
} from "@shared/proto-conversions/models/typeConversion"
import { buildApiHandler } from "@/core/api"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

/**
 * Updates API configuration
 * @param controller The controller instance
 * @param request The update API configuration request
 * @returns Empty response
 */
export async function updateApiConfigurationProto(
	controller: Controller,
	request: UpdateApiConfigurationRequest,
): Promise<Empty> {
	try {
		if (!request.apiConfiguration) {
			Logger.log("[APICONFIG: updateApiConfigurationProto] API configuration is required")
			throw new Error("API configuration is required")
		}

		const protoApiConfiguration = request.apiConfiguration

		const convertedApiConfigurationFromProto = {
			...protoApiConfiguration,
			// Convert proto ApiProvider enums to native string types
			planModeApiProvider:
				protoApiConfiguration.planModeApiProvider !== undefined
					? convertProtoToApiProvider(protoApiConfiguration.planModeApiProvider!)
					: undefined,
			actModeApiProvider:
				protoApiConfiguration.actModeApiProvider !== undefined
					? convertProtoToApiProvider(protoApiConfiguration.actModeApiProvider!)
					: undefined,

			// Convert ModelInfo objects (empty arrays → undefined)
			// Plan Mode
			planModeOpenRouterModelInfo: protoApiConfiguration.planModeOpenRouterModelInfo
				? fromProtobufModelInfo(protoApiConfiguration.planModeOpenRouterModelInfo)
				: undefined,
			planModeOpenAiModelInfo: protoApiConfiguration.planModeOpenAiModelInfo
				? fromProtobufOpenAiCompatibleModelInfo(protoApiConfiguration.planModeOpenAiModelInfo)
				: undefined,
			planModeLiteLlmModelInfo: protoApiConfiguration.planModeLiteLlmModelInfo
				? fromProtobufLiteLLMModelInfo(protoApiConfiguration.planModeLiteLlmModelInfo)
				: undefined,

			// Act Mode
			actModeOpenRouterModelInfo: protoApiConfiguration.actModeOpenRouterModelInfo
				? fromProtobufModelInfo(protoApiConfiguration.actModeOpenRouterModelInfo)
				: undefined,
			actModeOpenAiModelInfo: protoApiConfiguration.actModeOpenAiModelInfo
				? fromProtobufOpenAiCompatibleModelInfo(protoApiConfiguration.actModeOpenAiModelInfo)
				: undefined,
			actModeLiteLlmModelInfo: protoApiConfiguration.actModeLiteLlmModelInfo
				? fromProtobufLiteLLMModelInfo(protoApiConfiguration.actModeLiteLlmModelInfo)
				: undefined,
			geminiPlanModeThinkingLevel: protoApiConfiguration.geminiPlanModeThinkingLevel,
			geminiActModeThinkingLevel: protoApiConfiguration.geminiActModeThinkingLevel,
		}

		// Update the API configuration in storage
		controller.stateManager.setApiConfiguration(convertedApiConfigurationFromProto)

		// Update the task's API handler if there's an active task
		if (controller.activeTask) {
			const currentMode = controller.stateManager.getGlobalSettingsKey("mode")
			controller.activeTask.api = buildApiHandler(
				{ ...convertedApiConfigurationFromProto, ulid: controller.activeTask.ulid },
				currentMode,
			)
		}

		// Post updated state to webview
		await controller.postStateToWebview()

		return Empty.create()
	} catch (error) {
		Logger.error(`Failed to update API configuration: ${error}`)
		throw error
	}
}
