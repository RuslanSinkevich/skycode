import { EmptyRequest } from "@shared/proto/skycode/common"
import { OpenRouterCompatibleModelInfo } from "@shared/proto/skycode/models"
import { toProtobufModels } from "../../../shared/proto-conversions/models/typeConversion"
import { Controller } from ".."
import { refreshBasetenModels } from "./refreshBasetenModels"

/**
 * Handles protobuf conversion for gRPC service
 * @param controller The controller instance
 * @param request Empty request object
 * @returns Response containing Baseten models (protobuf types)
 */
export async function refreshBasetenModelsRpc(
	controller: Controller,
	_request: EmptyRequest,
): Promise<OpenRouterCompatibleModelInfo> {
	const models = await refreshBasetenModels(controller)
	return OpenRouterCompatibleModelInfo.create({ models: toProtobufModels(models) })
}
