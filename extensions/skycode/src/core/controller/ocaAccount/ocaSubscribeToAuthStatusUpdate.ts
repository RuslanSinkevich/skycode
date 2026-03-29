import { EmptyRequest } from "@shared/proto/skycode/common"
import { OcaAuthState } from "@shared/proto/skycode/oca_account"
import { OcaAuthService } from "@/services/auth/oca/OcaAuthService"
import { Controller } from ".."
import { StreamingResponseHandler } from "../grpc-handler"

export async function ocaSubscribeToAuthStatusUpdate(
	_controller: Controller,
	request: EmptyRequest,
	responseStream: StreamingResponseHandler<OcaAuthState>,
	requestId?: string,
): Promise<void> {
	return OcaAuthService.getInstance().subscribeToAuthStatusUpdate(request, responseStream, requestId)
}
