import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { TranscribeAudioRequest, Transcription } from "@shared/proto/skycode/dictation"
import { getWhisperLocalService } from "@/services/dictation/WhisperLocalService"
import { telemetryService } from "@/services/telemetry"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Transcribes audio using local Whisper.cpp.
 *
 * Local mode: audioBase64 → temp .webm file → ffmpeg convert to .wav → whisper.cpp → text
 */
export const transcribeAudio = async (controller: Controller, request: TranscribeAudioRequest): Promise<Transcription> => {
	const taskId = controller.task?.taskId
	const startTime = Date.now()
	const language = request.language || "ru"

	telemetryService.captureVoiceTranscriptionStarted(taskId, language)

	try {
		// Try local Whisper.cpp first
		const whisper = getWhisperLocalService()
		if (whisper?.isReady) {
			Logger.info("[transcribeAudio] Using local Whisper.cpp")
			const text = await transcribeWithLocalWhisper(whisper, request.audioBase64, language)
			const durationMs = Date.now() - startTime
			Logger.info(`[transcribeAudio] Result: "${text?.substring(0, 80)}", ${durationMs}ms`)

			if (text) {
				telemetryService.captureVoiceTranscriptionCompleted(taskId, text.length, durationMs, language)
			}

			return Transcription.create({ text: text ?? "", error: "" })
		}

		const durationMs = Date.now() - startTime
		const error = "Local voice components are not installed. Open Voice settings and download the local Whisper package."
		telemetryService.captureVoiceTranscriptionError(taskId, "local_whisper_not_ready", error, durationMs)

		return Transcription.create({ text: "", error })
	} catch (error) {
		Logger.error("[transcribeAudio] Error:", error)
		const durationMs = Date.now() - startTime
		const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"

		telemetryService.captureVoiceTranscriptionError(taskId, "unexpected_error", errorMessage, durationMs)

		return Transcription.create({
			text: "",
			error: errorMessage,
		})
	}
}

/**
 * Transcribe audio using local Whisper.cpp.
 * Converts base64 webm → WAV → runs whisper.cpp → returns text.
 */
async function transcribeWithLocalWhisper(
	whisper: NonNullable<ReturnType<typeof getWhisperLocalService>>,
	audioBase64: string,
	language: string,
): Promise<string> {
	const tempDir = os.tmpdir()
	const timestamp = Date.now()
	const webmPath = path.join(tempDir, `skycode_whisper_${timestamp}.webm`)
	const wavPath = path.join(tempDir, `skycode_whisper_${timestamp}.wav`)

	try {
		// 1. Write base64 audio to temp file
		const audioBuffer = Buffer.from(audioBase64, "base64")
		fs.writeFileSync(webmPath, audioBuffer)

		// 2. Convert to WAV 16kHz mono (whisper.cpp requirement)
		await whisper.convertToWav(webmPath, wavPath)

		// 3. Transcribe with whisper.cpp
		const text = await whisper.transcribe(wavPath, language)

		return text
	} catch (err) {
		Logger.error("[transcribeLocal] Error:", err)
		throw err
	} finally {
		// Cleanup temp files
		if (fs.existsSync(webmPath)) {
			fs.unlinkSync(webmPath)
		}
		if (fs.existsSync(wavPath)) {
			fs.unlinkSync(wavPath)
		}
	}
}
