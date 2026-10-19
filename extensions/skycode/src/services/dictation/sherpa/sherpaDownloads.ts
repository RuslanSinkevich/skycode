// [SKYCODE] Таблица закреплённых загрузок для локальной диктовки GigaAM v3 на sherpa-onnx.
// Чистый модуль без нативных зависимостей: только данные и отображение платформ.

export const SHERPA_VERSION = "1.13.8"

export type SherpaPlatformKey = "win32-x64" | "darwin-arm64" | "darwin-x64" | "linux-x64" | "linux-arm64"

export interface PinnedDownload {
	/** Короткий идентификатор (для логов) */
	id: string
	url: string
	/** Размер файла в байтах — используется как вес в общем прогрессе */
	sizeBytes: number
	hashAlgorithm: "sha256" | "sha512"
	hashEncoding: "hex" | "base64"
	/** Ожидаемый хеш в указанной кодировке */
	expectedHash: string
}

const SUPPORTED_PLATFORMS: Record<string, SherpaPlatformKey> = {
	"win32-x64": "win32-x64",
	"darwin-arm64": "darwin-arm64",
	"darwin-x64": "darwin-x64",
	"linux-x64": "linux-x64",
	"linux-arm64": "linux-arm64",
}

/** Возвращает ключ платформы или null, если движок на ней недоступен (например, win32-ia32, freebsd) */
export function getSherpaPlatformKey(platform: string, arch: string): SherpaPlatformKey | null {
	return SUPPORTED_PLATFORMS[`${platform}-${arch}`] ?? null
}

export interface NpmPackageSpec {
	/** Имя npm-пакета, оно же имя папки в runtime/node_modules */
	name: string
	download: PinnedDownload
}

function npmPackage(name: string, sizeBytes: number, integrity: string): NpmPackageSpec {
	return {
		name,
		download: {
			id: name,
			url: `https://registry.npmjs.org/${name}/-/${name}-${SHERPA_VERSION}.tgz`,
			sizeBytes,
			hashAlgorithm: "sha512",
			hashEncoding: "base64",
			expectedHash: integrity.replace(/^sha512-/, ""),
		},
	}
}

const NODE_WRAPPER = npmPackage(
	"sherpa-onnx-node",
	11954,
	"sha512-MsDMBdhLFTZ1GwvcGSSQhnS7g/EA8OMH6IYysCVUOM7j8Icty9KRc0E6YT1A5fWBsZwRfKOeh88QC95aRvS8ag==",
)

const NATIVE_PACKAGES: Record<SherpaPlatformKey, NpmPackageSpec> = {
	"win32-x64": npmPackage(
		"sherpa-onnx-win-x64",
		8894875,
		"sha512-oZF1c9VPOKtMwn83Bboc5XSWL+76BRoyB3eUuVnCknBKxwSULZU2Foia9VHWzU+n4I12rPsP6z6H9Rp1hD9o8g==",
	),
	"darwin-arm64": npmPackage(
		"sherpa-onnx-darwin-arm64",
		10047754,
		"sha512-FPNgJMgnWVl/KhRTIhG3KL3A4Om63Rn4YKXc9/uHY7SzLcvqLJLc/h7UBWJwduXvv7K18t5NpxHR6XgXn4sjWw==",
	),
	"darwin-x64": npmPackage(
		"sherpa-onnx-darwin-x64",
		11191481,
		"sha512-7BLRpjM6w4f9W46/nmkmq8lEKUayhebvcpslCVQ+6QN2uReYlZEMDZlSpXMjme+hUFrPfRz8P3UNq8ep/4d19g==",
	),
	"linux-x64": npmPackage(
		"sherpa-onnx-linux-x64",
		11089653,
		"sha512-6plnhjagsSeTntCgnlag86hWbs/uZE9Crms1LgOb68/1nKsIQjMd+WG519m+aPwT6TrsBOiEMzrx41t8sL5L5g==",
	),
	"linux-arm64": npmPackage(
		"sherpa-onnx-linux-arm64",
		13910679,
		"sha512-Tlg7a70b/Wge3OF8IgTHF9jhSVCsLyKQKhwc4BsJ5A+dL/SrFtGBjzuHp4XeLhiiOT7afCxX5PdSn/D4c8Lnuw==",
	),
}

/** npm-пакеты рантайма: JS-обёртка + нативный аддон под платформу */
export function getRuntimePackages(key: SherpaPlatformKey): NpmPackageSpec[] {
	return [NODE_WRAPPER, NATIVE_PACKAGES[key]]
}

export const GIGAAM_MODEL_FOLDER = "sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16"

/** Файлы модели, которые нужны распознавателю (остальное из архива удаляется) */
export const GIGAAM_MODEL_FILES = ["encoder.int8.onnx", "decoder.onnx", "joiner.onnx", "tokens.txt"] as const

export const GIGAAM_MODEL_ARCHIVE: PinnedDownload = {
	id: "gigaam-v3-punct",
	url: `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${GIGAAM_MODEL_FOLDER}.tar.bz2`,
	sizeBytes: 170197019,
	hashAlgorithm: "sha256",
	hashEncoding: "hex",
	expectedHash: "f9620a0099019c6afcee26525ef9ed3297fa50dd5691c1902af0c948fc1a470b",
}

export const SILERO_VAD: PinnedDownload = {
	id: "silero-vad",
	url: "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx",
	sizeBytes: 643854,
	hashAlgorithm: "sha256",
	hashEncoding: "hex",
	expectedHash: "9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6",
}

const FFMPEG_ASSETS: Record<SherpaPlatformKey, { size: number; sha256: string }> = {
	"win32-x64": { size: 29581307, sha256: "8883a3dffbd0a16cf4ef95206ea05283f78908dbfb118f73c83f4951dcc06d77" },
	"darwin-arm64": { size: 19246198, sha256: "8923876afa8db5585022d7860ec7e589af192f441c56793971276d450ed3bbfa" },
	"darwin-x64": { size: 25296431, sha256: "929b375c1182d956c51f7ac25e0b2b0411fb01f6f407aa15c9758efeb4242106" },
	"linux-x64": { size: 29354986, sha256: "bfe8a8fc511530457b528c48d77b5737527b504a3797a9bc4866aeca69c2dffa" },
	"linux-arm64": { size: 25568691, sha256: "754a678672298bc68156adff58aa7385a592c2b30b1d0ae8750c45c915c4bac0" },
}

/** gzip-архив ffmpeg (ffmpeg-static) — нужен только если в системе нет подходящего ffmpeg */
export function getFfmpegDownload(key: SherpaPlatformKey): PinnedDownload {
	const asset = FFMPEG_ASSETS[key]
	return {
		id: "ffmpeg",
		url: `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${key}.gz`,
		sizeBytes: asset.size,
		hashAlgorithm: "sha256",
		hashEncoding: "hex",
		expectedHash: asset.sha256,
	}
}

/**
 * Веса этапов для сквозного прогресса 0–100 по всем загрузкам.
 * Считаются по размеру файлов, поэтому полоса идёт ровно, а не прыгает на мелких пакетах.
 */
export function computeProgressWeights(sizes: number[]): number[] {
	const total = sizes.reduce((a, b) => a + b, 0)
	if (total <= 0) {
		return sizes.map(() => 0)
	}
	return sizes.map((s) => s / total)
}
