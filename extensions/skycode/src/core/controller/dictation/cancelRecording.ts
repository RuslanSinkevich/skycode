import { RecordingResult } from "@shared/proto/skycode/dictation"
import { audioRecordingService } from "@/services/dictation/AudioRecordingService"
import { getSherpaDictationService } from "@/services/dictation/SherpaDictationService"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Cancels audio recording without saving or transcribing the audio
 */
export const cancelRecording = async (controller: Controller): Promise<RecordingResult> => {
	let errorMessage = ""
	let isSuccess = true

	try {
		// [SKYCODE] Запись GigaAM отменяем отдельно: там воркер и стриминговый ffmpeg
		const sherpaDictation = getSherpaDictationService()
		if (sherpaDictation.isActive) {
			await sherpaDictation.cancel()
			return RecordingResult.create({ success: true, error: "" })
		}

		const result = await audioRecordingService.cancelRecording()
		isSuccess = !!result?.success
		errorMessage = result?.error ?? ""
	} catch (error) {
		Logger.error("Error canceling recording:", error)
		isSuccess = false
		errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
	}

	return RecordingResult.create({
		success: isSuccess,
		error: errorMessage ?? "",
	})
}
