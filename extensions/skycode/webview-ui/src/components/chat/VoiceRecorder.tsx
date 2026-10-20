import { GIGAAM_MODEL_ID } from "@shared/DictationSettings"
import { EmptyRequest } from "@shared/proto/index.skycode"
import { TranscribeAudioRequest } from "@shared/proto/skycode/dictation"
import React, { useCallback, useEffect, useRef, useState } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { DictationServiceClient } from "@/services/grpc-client"
import { formatSeconds } from "@/utils/format"

interface VoiceRecorderProps {
	onTranscription: (text: string) => void
	onProcessingStateChange?: (isProcessing: boolean, message?: string) => void
	onRecordingStateChange?: (isRecording: boolean) => void
	disabled?: boolean
	language?: string
	/** Движок распознавания из настроек (whisperModel): "gigaam" включает живой текст */
	engine?: string
	/** GigaAM: запись стартует — родитель запоминает текст до/после курсора */
	onLiveStart?: () => void
	/** GigaAM: живой текст (committed + partial); finished=true — итоговый текст, превью закреплено */
	onLiveText?: (text: string, finished: boolean) => void
	/** Сюда кладётся функция остановки записи — родитель останавливает запись, когда отправляют сообщение */
	stopRef?: React.MutableRefObject<(() => Promise<void>) | null>
}

const MAX_DURATION = 5 * 60 // 5 minutes

/**
 * VoiceRecorder — microphone button with 3 states:
 *
 * 1. IDLE:        🎤 mic icon — click to start recording
 * 2. RECORDING:   🔴 pulsing red dot + timer — click to stop & transcribe
 * 3. TRANSCRIBING: ⏳ spinner — waiting for whisper.cpp
 *
 * Replaces the Send button during recording (handled by parent ChatTextArea).
 */
const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
	onTranscription,
	onProcessingStateChange,
	onRecordingStateChange,
	disabled = false,
	language = "ru",
	engine,
	onLiveStart,
	onLiveText,
	stopRef,
}) => {
	const { t } = useI18n()
	const [state, setState] = useState<"idle" | "starting" | "recording" | "transcribing">("idle")
	const [recordingDuration, setRecordingDuration] = useState(0)
	const [error, setError] = useState<string | null>(null)
	const pollingRef = useRef<NodeJS.Timeout | null>(null)

	// [SKYCODE] Живой текст GigaAM: подписка на поток, пока идёт запись
	const liveMode = engine === GIGAAM_MODEL_ID && language === "ru"
	const liveSubscriptionRef = useRef<(() => void) | null>(null)
	const liveActiveRef = useRef(false)
	// Колбэки родителя меняются на каждый рендер — храним в ref, чтобы подписка не ловила устаревшие
	const onLiveTextRef = useRef(onLiveText)
	onLiveTextRef.current = onLiveText

	const stopLiveSubscription = useCallback(() => {
		liveSubscriptionRef.current?.()
		liveSubscriptionRef.current = null
	}, [])

	// Detect "preparing/downloading" state (both EN and RU contain "170")
	const isPreparing = error
		? error.includes("170") || error.includes("preparing")
		: false

	// Notify parent of recording state
	useEffect(() => {
		onRecordingStateChange?.(state === "recording")
	}, [state, onRecordingStateChange])

	// Poll recording duration
	useEffect(() => {
		if (state === "recording") {
			pollingRef.current = setInterval(async () => {
				try {
					const status = await DictationServiceClient.getRecordingStatus(EmptyRequest.create({}))
					if (status.isRecording) {
						setRecordingDuration(Math.floor(status.durationSeconds))
						if (status.durationSeconds >= MAX_DURATION) {
							handleStop()
						}
					}
				} catch {}
			}, 1000)
		} else {
			if (pollingRef.current) {
				clearInterval(pollingRef.current)
				pollingRef.current = null
			}
		}
		return () => {
			if (pollingRef.current) {
				clearInterval(pollingRef.current)
				pollingRef.current = null
			}
		}
	}, [state])

	const handleMicClick = useCallback(async () => {
		if (disabled || state === "starting" || state === "transcribing") { return }

		// Clear error on click
		if (error) {
			setError(null)
			return
		}

		setState("starting")
		setRecordingDuration(0)

		try {
			if (liveMode) {
				// Подписываемся до старта записи, чтобы не пропустить первые обновления
				onLiveStart?.()
				liveActiveRef.current = true
				stopLiveSubscription()
				liveSubscriptionRef.current = DictationServiceClient.subscribeToDictationText(EmptyRequest.create({}), {
					onResponse: (update) => {
						if (!liveActiveRef.current) {
							return
						}
						if (update.error) {
							// Сбой записи/распознавания: убираем превью и останавливаем запись
							liveActiveRef.current = false
							stopLiveSubscription()
							onLiveTextRef.current?.("", true)
							DictationServiceClient.cancelRecording(EmptyRequest.create({})).catch(() => {})
							setError(update.error)
							setState("idle")
							onProcessingStateChange?.(false)
							return
						}
						if (!update.final) {
							const live = [update.committed, update.partial].filter(Boolean).join(" ")
							onLiveTextRef.current?.(live, false)
						}
					},
					onError: () => {},
					onComplete: () => {},
				})
			}
			const response = await DictationServiceClient.startRecording(EmptyRequest.create({}))
			if (!response.success) {
				liveActiveRef.current = false
				stopLiveSubscription()
				onLiveTextRef.current?.("", true)
				setError(response.error || t("voice.failedToStart"))
				setState("idle")
				return
			}
			setState("recording")
		} catch (err) {
			liveActiveRef.current = false
			stopLiveSubscription()
			onLiveTextRef.current?.("", true)
			setError(err instanceof Error ? err.message : t("voice.failedToStart"))
			setState("idle")
		}
	}, [disabled, state, error, t, liveMode, onLiveStart, onProcessingStateChange, stopLiveSubscription])

	const handleStop = useCallback(async () => {
		if (state !== "recording") { return }

		setState("transcribing")
		// Для живого текста не дописываем "[Transcribing...]" в поле: превью уже в нём
		onProcessingStateChange?.(true, liveActiveRef.current ? undefined : t("chat.transcribing"))

		try {
			// 1. Stop recording
			const response = await DictationServiceClient.stopRecording(EmptyRequest.create({}))

			if (!response.success) {
				if (liveActiveRef.current) {
					liveActiveRef.current = false
					stopLiveSubscription()
					onLiveTextRef.current?.("", true)
				}
				setError(response.error || t("voice.failedToStop"))
				setState("idle")
				onProcessingStateChange?.(false)
				return
			}

			// GigaAM: итоговый текст приходит прямо в ответе stopRecording, транскрибировать не нужно
			if (response.finalText || (liveActiveRef.current && !response.audioBase64)) {
				liveActiveRef.current = false
				stopLiveSubscription()
				setError(null)
				if (onLiveTextRef.current) {
					onLiveTextRef.current(response.finalText, true)
				} else if (response.finalText) {
					onTranscription(response.finalText)
				}
				setState("idle")
				onProcessingStateChange?.(false)
				return
			}
			// Живой режим был включён, но запись пошла через whisper — убираем превью и идём обычным путём
			if (liveActiveRef.current) {
				liveActiveRef.current = false
				stopLiveSubscription()
				onLiveTextRef.current?.("", true)
			}

			if (!response.audioBase64) {
				setError(t("voice.noAudioData"))
				setState("idle")
				onProcessingStateChange?.(false)
				return
			}

			// 2. Transcribe
			const result = await DictationServiceClient.transcribeAudio(
				TranscribeAudioRequest.create({
					audioBase64: response.audioBase64,
					language,
				}),
			)

			if (result.error) {
				setError(result.error)
				setTimeout(() => setError(null), 5000)
			} else if (result.text) {
				setError(null)
				onTranscription(result.text)
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred")
		} finally {
			setState("idle")
			onProcessingStateChange?.(false)
		}
	}, [state, language, onTranscription, onProcessingStateChange, t, stopLiveSubscription])

	useEffect(() => {
		if (stopRef) {
			stopRef.current = handleStop
		}
	}, [stopRef, handleStop])

	const _handleCancel = useCallback(async () => {
		if (state !== "recording") { return }

		try {
			await DictationServiceClient.cancelRecording(EmptyRequest.create({}))
		} catch {}

		// Отмена: превью из поля убираем
		if (liveActiveRef.current) {
			liveActiveRef.current = false
			stopLiveSubscription()
			onLiveTextRef.current?.("", true)
		}
		setState("idle")
		onProcessingStateChange?.(false)
	}, [state, onProcessingStateChange, stopLiveSubscription])

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (pollingRef.current) { clearInterval(pollingRef.current) }
			// GigaAM: не оставляем запись и подписку висеть, если компонент закрыли посреди диктовки
			if (liveActiveRef.current) {
				liveActiveRef.current = false
				liveSubscriptionRef.current?.()
				liveSubscriptionRef.current = null
				DictationServiceClient.cancelRecording(EmptyRequest.create({})).catch(() => {})
			}
		}
	}, [])

	// ─── RECORDING STATE: red pulsing dot + timer + cancel ───
	if (state === "recording") {
		return (
			<div className="flex items-center gap-1.5 mr-1.5">
				{/* Pulsing red recording indicator + timer */}
				<Tooltip>
					<TooltipTrigger asChild>
						<div
							className="flex items-center gap-1 cursor-pointer input-icon-button"
							data-testid="stop-recording-button"
							onClick={handleStop}>
							{/* Red pulsing dot */}
							<span className="relative flex h-4 w-4">
								<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
								<span className="relative inline-flex rounded-full h-4 w-4 bg-red-500" />
							</span>
							{/* Timer */}
							<span className="text-sm text-description tabular-nums">
								{formatSeconds(recordingDuration)}
							</span>
						</div>
					</TooltipTrigger>
					<TooltipContent side="top">
						{t("chat.stopRecording")} ({formatSeconds(recordingDuration)}/{formatSeconds(MAX_DURATION)})
					</TooltipContent>
				</Tooltip>

				{/* Cancel button — hidden for now */}
			</div>
		)
	}

	// ─── IDLE / STARTING / TRANSCRIBING: mic icon ───
	const isLoading = state === "starting" || state === "transcribing" || isPreparing
	const iconClass = isLoading ? "codicon-loading" : error ? "codicon-error" : "codicon-mic"
	const iconColor = error && !isPreparing ? "text-error" : ""

	let tooltipText: string
	if (state === "transcribing") {
		tooltipText = t("chat.transcribing")
	} else if (state === "starting") {
		tooltipText = t("chat.startingRecording")
	} else if (isPreparing && error) {
		tooltipText = error
	} else if (error) {
		tooltipText = `${t("chat.error")}: ${error}`
	} else {
		tooltipText = t("chat.voiceInput")
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<div
					className={cn("pt-1 input-icon-button mr-1.5 text-base mt-0.5", {
						disabled: disabled || isLoading,
						"animate-spin": isLoading,
					})}
					data-testid="voice-recorder-start-button"
					onClick={handleMicClick}
					style={{ color: iconColor || undefined }}>
					<span className={`codicon ${iconClass}`} />
				</div>
			</TooltipTrigger>
			<TooltipContent side="top">{tooltipText}</TooltipContent>
		</Tooltip>
	)
}

export default VoiceRecorder
