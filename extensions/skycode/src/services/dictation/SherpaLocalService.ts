import { execFile } from "node:child_process"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { pipeline } from "node:stream/promises"
import { promisify } from "node:util"
import * as zlib from "node:zlib"
import * as tar from "tar"
import { AUDIO_PROGRAM_CONFIG } from "@/shared/audioProgramConstants"
import { Logger } from "@/shared/services/Logger"
import { downloadPinned } from "./sherpa/downloadPinned"
import {
	computeProgressWeights,
	getFfmpegDownload,
	getRuntimePackages,
	getSherpaPlatformKey,
	GIGAAM_MODEL_ARCHIVE,
	GIGAAM_MODEL_FILES,
	GIGAAM_MODEL_FOLDER,
	type PinnedDownload,
	SILERO_VAD,
	type SherpaPlatformKey,
} from "./sherpa/sherpaDownloads"

const execFileAsync = promisify(execFile)

interface InstallStep {
	download: PinnedDownload
	run: (onFraction: (fraction: number) => void) => Promise<void>
}

/**
 * [SKYCODE] SherpaLocalService — установка и проверка файлов движка диктовки GigaAM v3 (sherpa-onnx).
 *
 * Файлы лежат в globalStoragePath/voice-sherpa/:
 *   ├── runtime/node_modules/sherpa-onnx-node, sherpa-onnx-<платформа>  — JS-обёртка и нативный аддон
 *   ├── models/gigaam-v3-punct/   — encoder/decoder/joiner/tokens
 *   ├── models/silero_vad.onnx    — VAD для нарезки речи по паузам
 *   └── ffmpeg/ffmpeg[.exe]       — только если в системе нет подходящего ffmpeg
 *
 * Ничего из этого не входит в VSIX: всё скачивается при первом включении движка.
 */
export class SherpaLocalService {
	readonly rootDir: string
	private readonly platformKey: SherpaPlatformKey | null
	private installing: Promise<void> | null = null

	constructor(globalStoragePath: string, platform: string = process.platform, arch: string = process.arch) {
		this.rootDir = path.join(globalStoragePath, "voice-sherpa")
		this.platformKey = getSherpaPlatformKey(platform, arch)
	}

	/** Доступен ли движок на этой платформе (win32-ia32, freebsd и т.п. — нет) */
	get isSupported(): boolean {
		return this.platformKey !== null
	}

	get runtimeDir(): string {
		return path.join(this.rootDir, "runtime")
	}

	get modelDir(): string {
		return path.join(this.rootDir, "models", "gigaam-v3-punct")
	}

	get vadPath(): string {
		return path.join(this.rootDir, "models", "silero_vad.onnx")
	}

	get ownFfmpegPath(): string {
		return path.join(this.rootDir, "ffmpeg", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg")
	}

	get isRuntimeReady(): boolean {
		if (!this.platformKey) {
			return false
		}
		return getRuntimePackages(this.platformKey).every((pkg) =>
			fs.existsSync(path.join(this.runtimeDir, "node_modules", pkg.name, "package.json")),
		)
	}

	get isModelReady(): boolean {
		return GIGAAM_MODEL_FILES.every((f) => fs.existsSync(path.join(this.modelDir, f)))
	}

	get isVadReady(): boolean {
		return fs.existsSync(this.vadPath)
	}

	/**
	 * Ищет ffmpeg: сначала установленный whisper-сервисом, потом наш собственный,
	 * затем системный PATH и типовые пути (так же, как AudioRecordingService).
	 */
	findFfmpeg(): string | null {
		try {
			const { getWhisperLocalService } = require("./WhisperLocalService") as typeof import("./WhisperLocalService")
			const whisperFfmpeg = getWhisperLocalService()?.ffmpegPath
			if (whisperFfmpeg && fs.existsSync(whisperFfmpeg)) {
				return whisperFfmpeg
			}
		} catch {
			// WhisperLocalService ещё не инициализирован
		}
		if (fs.existsSync(this.ownFfmpegPath)) {
			return this.ownFfmpegPath
		}
		const config = AUDIO_PROGRAM_CONFIG[os.platform() as keyof typeof AUDIO_PROGRAM_CONFIG]
		if (!config) {
			return null
		}
		const exeName = os.platform() === "win32" ? "ffmpeg.exe" : config.command
		for (const dir of (process.env.PATH || "").split(path.delimiter)) {
			if (!dir) {
				continue
			}
			const candidate = path.join(dir, exeName)
			if (fs.existsSync(candidate)) {
				return candidate
			}
		}
		for (const candidate of config.fallbackPaths) {
			if (fs.existsSync(candidate)) {
				return candidate
			}
		}
		return null
	}

	/** Всё готово к диктовке: рантайм, модель, VAD и ffmpeg */
	isReady(): boolean {
		return this.isRuntimeReady && this.isModelReady && this.isVadReady && this.findFfmpeg() !== null
	}

	/** Удаляет модель, рантайм и VAD для переустановки (ffmpeg не трогаем — он общий) */
	reset(): void {
		for (const target of [this.runtimeDir, path.join(this.rootDir, "models")]) {
			try {
				fs.rmSync(target, { recursive: true, force: true })
			} catch (err) {
				Logger.error(`[SherpaLocal] Failed to delete ${target}:`, err)
			}
		}
	}

	/**
	 * Скачивает недостающие компоненты. Прогресс 0–100 сквозной по всем загрузкам (вес = размер файла).
	 * Повторный вызов во время установки возвращает тот же промис.
	 */
	install(onProgress?: (percent: number) => void): Promise<void> {
		if (!this.platformKey) {
			return Promise.reject(new Error(`Russian GigaAM dictation is not available on ${process.platform}-${process.arch}`))
		}
		if (!this.installing) {
			this.installing = this.runInstall(this.platformKey, onProgress).finally(() => {
				this.installing = null
			})
		}
		return this.installing
	}

	private async runInstall(key: SherpaPlatformKey, onProgress?: (percent: number) => void): Promise<void> {
		fs.mkdirSync(this.rootDir, { recursive: true })
		const steps = this.planSteps(key)
		const weights = computeProgressWeights(steps.map((s) => s.download.sizeBytes))
		let lastPercent = -1
		const report = (percent: number) => {
			const rounded = Math.max(0, Math.min(100, Math.floor(percent)))
			if (rounded !== lastPercent) {
				lastPercent = rounded
				onProgress?.(rounded)
			}
		}
		report(0)

		let done = 0
		for (let i = 0; i < steps.length; i++) {
			const base = done
			const weight = weights[i]
			await steps[i].run((fraction) => report((base + weight * fraction) * 100))
			done += weight
			report(done * 100)
		}

		if (!this.isRuntimeReady || !this.isModelReady || !this.isVadReady) {
			throw new Error("Installation finished but required files were not found")
		}
		if (!this.findFfmpeg()) {
			throw new Error("ffmpeg was not found after installation")
		}
		report(100)
		Logger.info("[SherpaLocal] All components ready")
	}

	private planSteps(key: SherpaPlatformKey): InstallStep[] {
		const steps: InstallStep[] = []

		for (const pkg of getRuntimePackages(key)) {
			const target = path.join(this.runtimeDir, "node_modules", pkg.name)
			if (fs.existsSync(path.join(target, "package.json"))) {
				continue
			}
			steps.push({
				download: pkg.download,
				run: async (onFraction) => {
					fs.mkdirSync(path.join(this.runtimeDir, "node_modules"), { recursive: true })
					const archive = path.join(this.runtimeDir, `${pkg.name}.tgz`)
					try {
						await downloadPinned(pkg.download, archive, (d, t) => onFraction(t ? d / t : 0))
						const staging = `${target}.installing`
						fs.rmSync(staging, { recursive: true, force: true })
						fs.mkdirSync(staging, { recursive: true })
						// npm-тарболы содержат верхнюю папку package/ — снимаем её
						await tar.x({ file: archive, cwd: staging, strip: 1 })
						fs.rmSync(target, { recursive: true, force: true })
						fs.renameSync(staging, target)
					} finally {
						fs.rmSync(archive, { force: true })
					}
				},
			})
		}

		if (!this.isVadReady) {
			steps.push({
				download: SILERO_VAD,
				run: async (onFraction) => {
					fs.mkdirSync(path.dirname(this.vadPath), { recursive: true })
					await downloadPinned(SILERO_VAD, this.vadPath, (d, t) => onFraction(t ? d / t : 0))
				},
			})
		}

		if (!this.findFfmpeg()) {
			const ffmpegDownload = getFfmpegDownload(key)
			steps.push({
				download: ffmpegDownload,
				run: async (onFraction) => {
					fs.mkdirSync(path.dirname(this.ownFfmpegPath), { recursive: true })
					const archive = `${this.ownFfmpegPath}.gz`
					const partial = `${this.ownFfmpegPath}.part`
					try {
						await downloadPinned(ffmpegDownload, archive, (d, t) => onFraction(t ? d / t : 0))
						await pipeline(fs.createReadStream(archive), zlib.createGunzip(), fs.createWriteStream(partial))
						if (process.platform !== "win32") {
							fs.chmodSync(partial, 0o755)
						}
						fs.rmSync(this.ownFfmpegPath, { force: true })
						fs.renameSync(partial, this.ownFfmpegPath)
					} finally {
						fs.rmSync(archive, { force: true })
						fs.rmSync(partial, { force: true })
					}
				},
			})
		}

		if (!this.isModelReady) {
			steps.push({
				download: GIGAAM_MODEL_ARCHIVE,
				run: async (onFraction) => {
					const modelsDir = path.dirname(this.modelDir)
					fs.mkdirSync(modelsDir, { recursive: true })
					const archive = path.join(modelsDir, "gigaam-v3-punct.tar.bz2")
					const staging = path.join(modelsDir, "gigaam-v3-punct.installing")
					try {
						await downloadPinned(GIGAAM_MODEL_ARCHIVE, archive, (d, t) => onFraction(t ? d / t : 0))
						fs.rmSync(staging, { recursive: true, force: true })
						fs.mkdirSync(staging, { recursive: true })
						await this.extractBzip2(archive, staging)
						const extracted = path.join(staging, GIGAAM_MODEL_FOLDER)
						for (const file of GIGAAM_MODEL_FILES) {
							if (!fs.existsSync(path.join(extracted, file))) {
								throw new Error(`Model archive extracted but ${file} is missing`)
							}
						}
						fs.rmSync(this.modelDir, { recursive: true, force: true })
						fs.renameSync(extracted, this.modelDir)
					} finally {
						fs.rmSync(archive, { force: true })
						fs.rmSync(staging, { recursive: true, force: true })
					}
				},
			})
		}

		return steps
	}

	/**
	 * npm-пакет tar не умеет bzip2, поэтому используем системный tar.
	 * На Windows берём %SystemRoot%\System32\tar.exe по абсолютному пути: tar из PATH может быть
	 * GNU tar из Git Bash, который ломается на путях с диском.
	 */
	private async extractBzip2(archive: string, destDir: string): Promise<void> {
		const tarExe =
			process.platform === "win32" ? path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe") : "tar"
		// Достаём только нужные файлы, остальное (тестовые wav и т.п.) нам не нужно
		const members = GIGAAM_MODEL_FILES.map((f) => `${GIGAAM_MODEL_FOLDER}/${f}`)
		try {
			await execFileAsync(tarExe, ["-xjf", archive, "-C", destDir, ...members], { timeout: 10 * 60 * 1000 })
		} catch (err) {
			const detail = err instanceof Error ? err.message.split("\n")[0] : String(err)
			throw new Error(`Failed to extract the speech model archive with system tar (${tarExe}): ${detail}`)
		}
	}
}

// Синглтон — создаётся, когда известен globalStoragePath
let _sherpaService: SherpaLocalService | null = null

export function getSherpaLocalService(globalStoragePath?: string): SherpaLocalService | null {
	if (globalStoragePath && (!_sherpaService || _sherpaService.rootDir !== path.join(globalStoragePath, "voice-sherpa"))) {
		_sherpaService = new SherpaLocalService(globalStoragePath)
	}
	return _sherpaService
}
