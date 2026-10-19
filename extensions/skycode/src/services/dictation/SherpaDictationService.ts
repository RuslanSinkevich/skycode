import * as path from "node:path"
import { Worker } from "node:worker_threads"
import { Logger } from "@/shared/services/Logger"
import { audioRecordingService } from "./AudioRecordingService"
import { Pcm16ToFloat32 } from "./sherpa/pcm"
import type { SherpaLocalService } from "./SherpaLocalService"

/** Событие живого текста диктовки для подписчиков (webview) */
export interface DictationTextEvent {
	committed: string
	partial: string
	final: boolean
	error: string
}

type Subscriber = (event: DictationTextEvent) => void

const WORKER_READY_TIMEOUT_MS = 60_000
const FINAL_TIMEOUT_MS = 10_000
/** Через сколько простоя выгружаем воркер с моделью из памяти */
const IDLE_TERMINATE_MS = 10 * 60_000

/**
 * [SKYCODE] SherpaDictationService — запись с микрофона в стриминговом режиме и распознавание GigaAM в воркере.
 *
 * ffmpeg отдаёт PCM в stdout → Float32 → воркер (VAD + GigaAM) → живой текст подписчикам.
 * Воркер остаётся «тёплым» между записями (загрузка модели ~1 с), выгружается при простое,
 * смене настроек и закрытии расширения.
 */
export class SherpaDictationService {
	private worker: Worker | null = null
	private workerReady: Promise<Worker> | null = null
	private idleTimer: ReturnType<typeof setTimeout> | null = null
	private subscribers = new Set<Subscriber>()
	private pcm = new Pcm16ToFloat32()
	private active = false
	private starting = false
	private lastText = { committed: "", partial: "" }
	private finalWaiter: { resolve: (text: string) => void; reject: (err: Error) => void } | null = null

	subscribe(subscriber: Subscriber): () => void {
		this.subscribers.add(subscriber)
		return () => {
			this.subscribers.delete(subscriber)
		}
	}

	get isActive(): boolean {
		return this.active
	}

	private emit(event: DictationTextEvent): void {
		for (const subscriber of this.subscribers) {
			try {
				subscriber(event)
			} catch (err) {
				Logger.error("[SherpaDictation] Subscriber failed:", err)
			}
		}
	}

	private emitError(message: string): void {
		this.emit({ committed: this.lastText.committed, partial: "", final: false, error: message })
	}

	private clearIdleTimer(): void {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer)
			this.idleTimer = null
		}
	}

	private armIdleTimer(): void {
		this.clearIdleTimer()
		this.idleTimer = setTimeout(() => {
			if (!this.active) {
				Logger.info("[SherpaDictation] Idle, unloading worker")
				void this.dispose()
			}
		}, IDLE_TERMINATE_MS)
		this.idleTimer.unref?.()
	}

	private ensureWorker(sherpa: SherpaLocalService, extensionPath: string): Promise<Worker> {
		if (this.worker && this.workerReady) {
			return this.workerReady
		}
		const workerPath = path.join(extensionPath, "dist", "sherpa-dictation-worker.js")
		const worker = new Worker(workerPath)
		this.worker = worker

		const ready = new Promise<Worker>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error("Speech engine did not start in time")), WORKER_READY_TIMEOUT_MS)
			worker.on("message", (msg: { type: string; committed?: string; partial?: string; text?: string; message?: string }) => {
				switch (msg.type) {
					case "ready":
						clearTimeout(timer)
						resolve(worker)
						break
					case "update":
						if (this.active) {
							this.lastText = { committed: msg.committed ?? "", partial: msg.partial ?? "" }
							this.emit({ ...this.lastText, final: false, error: "" })
						}
						break
					case "final":
						this.finalWaiter?.resolve(msg.text ?? "")
						this.finalWaiter = null
						break
					case "error": {
						const err = new Error(msg.message ?? "Speech engine error")
						Logger.error("[SherpaDictation] Worker error:", err)
						clearTimeout(timer)
						reject(err)
						if (this.finalWaiter) {
							this.finalWaiter.reject(err)
							this.finalWaiter = null
						} else if (this.active) {
							this.emitError(err.message)
						}
						break
					}
				}
			})
			worker.on("error", (err) => {
				Logger.error("[SherpaDictation] Worker crashed:", err)
				clearTimeout(timer)
				reject(err)
				this.finalWaiter?.reject(err)
				this.finalWaiter = null
				if (this.active) {
					this.emitError(err.message)
				}
				this.forgetWorker(worker)
			})
			worker.on("exit", () => {
				clearTimeout(timer)
				reject(new Error("Speech engine stopped"))
				this.finalWaiter?.reject(new Error("Speech engine stopped"))
				this.finalWaiter = null
				this.forgetWorker(worker)
			})
			worker.postMessage({
				type: "init",
				runtimeDir: sherpa.runtimeDir,
				modelDir: sherpa.modelDir,
				vadPath: sherpa.vadPath,
				numThreads: 4,
			})
		})
		// Если инициализация не удалась — не держим сломанный воркер
		ready.catch(() => this.forgetWorker(worker))
		this.workerReady = ready
		return ready
	}

	private forgetWorker(worker: Worker): void {
		if (this.worker === worker) {
			this.worker = null
			this.workerReady = null
		}
	}

	/** Запускает запись. Модель грузится до старта ffmpeg, чтобы не потерять начало речи */
	async start(sherpa: SherpaLocalService, extensionPath: string, deviceId?: string): Promise<{ success: boolean; error?: string }> {
		if (this.active || this.starting) {
			return { success: false, error: "Already recording" }
		}
		const ffmpegPath = sherpa.findFfmpeg()
		if (!ffmpegPath) {
			return { success: false, error: "ffmpeg was not found. Download the voice components in Voice settings." }
		}
		this.clearIdleTimer()
		let worker: Worker
		this.starting = true
		try {
			worker = await this.ensureWorker(sherpa, extensionPath)
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			this.starting = false
			return { success: false, error: `Failed to start the speech engine: ${message}` }
		}

		this.lastText = { committed: "", partial: "" }
		this.pcm.reset()
		worker.postMessage({ type: "reset" })
		this.active = true
		this.starting = false

		const result = await audioRecordingService.startStreamingRecording(
			ffmpegPath,
			deviceId,
			(chunk) => {
				const samples = this.pcm.push(chunk)
				if (samples.length > 0 && this.active) {
					worker.postMessage({ type: "audio", samples }, [samples.buffer as ArrayBuffer])
				}
			},
			(message) => {
				if (this.active) {
					this.emitError(message)
				}
			},
		)
		if (!result.success) {
			this.active = false
			this.armIdleTimer()
			return result
		}
		return { success: true }
	}

	/** Останавливает запись и возвращает итоговый текст */
	async stop(): Promise<{ success: boolean; text?: string; error?: string }> {
		if (!this.active) {
			return { success: false, error: "Not currently recording" }
		}
		await audioRecordingService.stopStreamingRecording()
		const worker = this.worker
		if (!worker) {
			this.active = false
			return { success: false, error: "Speech engine stopped unexpectedly" }
		}

		try {
			const text = await new Promise<string>((resolve, reject) => {
				const timer = setTimeout(() => {
					this.finalWaiter = null
					reject(new Error("Timed out waiting for the final text"))
				}, FINAL_TIMEOUT_MS)
				this.finalWaiter = {
					resolve: (value) => {
						clearTimeout(timer)
						resolve(value)
					},
					reject: (err) => {
						clearTimeout(timer)
						reject(err)
					},
				}
				worker.postMessage({ type: "finish" })
			})
			this.emit({ committed: text, partial: "", final: true, error: "" })
			return { success: true, text }
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err)
			Logger.warn(`[SherpaDictation] Finish failed: ${message}`)
			// Воркер мог зависнуть — выгружаем, поднимется заново при следующей записи
			void this.dispose()
			const fallback = [this.lastText.committed, this.lastText.partial].filter(Boolean).join(" ")
			if (fallback) {
				return { success: true, text: fallback }
			}
			return { success: false, error: message }
		} finally {
			this.active = false
			this.armIdleTimer()
		}
	}

	/** Отмена: останавливаем запись, воркер выгружаем — так не придут запоздалые обновления */
	async cancel(): Promise<void> {
		if (!this.active) {
			return
		}
		this.active = false
		await audioRecordingService.stopStreamingRecording()
		await this.dispose()
	}

	/** Выгружает воркер (при простое, смене настроек, переустановке файлов и закрытии расширения) */
	async dispose(): Promise<void> {
		this.clearIdleTimer()
		const worker = this.worker
		this.worker = null
		this.workerReady = null
		if (worker) {
			try {
				await worker.terminate()
			} catch (err) {
				Logger.warn("[SherpaDictation] Failed to terminate worker:", err)
			}
		}
	}
}

let _sherpaDictation: SherpaDictationService | null = null

export function getSherpaDictationService(): SherpaDictationService {
	if (!_sherpaDictation) {
		_sherpaDictation = new SherpaDictationService()
	}
	return _sherpaDictation
}
