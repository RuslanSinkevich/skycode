import { RecordedAudio } from "@shared/proto/skycode/dictation"
import { audioRecordingService } from "@/services/dictation/AudioRecordingService"
import { getSherpaDictationService } from "@/services/dictation/SherpaDictationService"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Stops audio recording and returns the recorded audio.
 */
export const stopRecording = async (controller: Controller): Promise<RecordedAudio> => {
	try {
		// [SKYCODE] Запись GigaAM: итоговый текст приходит сразу, аудио для whisper не нужно
		const sherpaDictation = getSherpaDictationService()
		if (sherpaDictation.isActive) {
			const dictated = await sherpaDictation.stop()
			return RecordedAudio.create({
				success: dictated.success,
				audioBase64: "",
				error: dictated.error ?? "",
				finalText: dictated.text ?? "",
			})
		}

		const result = await audioRecordingService.stopRecording()

		return RecordedAudio.create({
			success: result.success,
			audioBase64: result.audioBase64 ?? "",
			error: result.error ?? "",
			finalText: "",
		})
	} catch (error) {
		Logger.error("Error stopping recording:", error)

		return RecordedAudio.create({
			success: false,
			audioBase64: "",
			error: error instanceof Error ? error.message : "Unknown error occurred",
			finalText: "",
		})
	}
}
