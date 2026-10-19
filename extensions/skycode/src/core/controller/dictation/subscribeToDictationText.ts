import { EmptyRequest } from "@shared/proto/skycode/common"
import { DictationText } from "@shared/proto/skycode/dictation"
import { getSherpaDictationService } from "@/services/dictation/SherpaDictationService"
import { Logger } from "@/shared/services/Logger"
import { getRequestRegistry, StreamingResponseHandler } from "../grpc-handler"
import { Controller } from "../index"

/**
 * [SKYCODE] Подписка на живой текст диктовки GigaAM: committed — зафиксированные фразы,
 * partial — текущая недосказанная, final — запись завершена, error — сбой записи/распознавания.
 */
export async function subscribeToDictationText(
	_controller: Controller,
	_request: EmptyRequest,
	responseStream: StreamingResponseHandler<DictationText>,
	requestId?: string,
): Promise<void> {
	const unsubscribe = getSherpaDictationService().subscribe((event) => {
		responseStream(
			DictationText.create({
				committed: event.committed,
				partial: event.partial,
				final: event.final,
				error: event.error,
			}),
			false,
		).catch((error) => {
			Logger.error("Error sending dictation text update:", error)
			unsubscribe()
		})
	})

	// Подписка снимается, когда webview закрывает поток
	if (requestId) {
		getRequestRegistry().registerRequest(requestId, unsubscribe, { type: "dictationText_subscription" }, responseStream)
	}
}
