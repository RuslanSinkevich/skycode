// [SKYCODE] Скачивание файла с проверкой хеша: пишем во временное имя, сверяем хеш потоком,
// и только при совпадении переименовываем в итоговое. При несовпадении файл удаляется, загрузка падает.
// Редиректы (GitHub releases) обрабатываются; таймаут считается по простою, а не по общему времени.
import { createHash } from "node:crypto"
import * as fs from "node:fs"
import * as http from "node:http"
import * as https from "node:https"
import { Logger } from "@/shared/services/Logger"
import type { PinnedDownload } from "./sherpaDownloads"

const MAX_REDIRECTS = 8
const INACTIVITY_MS = 120_000

export type ByteProgress = (downloaded: number, total: number) => void

export async function downloadPinned(spec: PinnedDownload, destPath: string, onProgress?: ByteProgress): Promise<void> {
	const tempPath = `${destPath}.part`
	removeQuietly(tempPath)
	try {
		const actual = await fetchToFile(spec, tempPath, onProgress)
		if (actual !== spec.expectedHash) {
			throw new Error(`Checksum mismatch for ${spec.id}: the downloaded file is corrupted or was tampered with`)
		}
		removeQuietly(destPath)
		fs.renameSync(tempPath, destPath)
	} catch (err) {
		removeQuietly(tempPath)
		throw err
	}
}

function removeQuietly(file: string): void {
	try {
		fs.rmSync(file, { force: true })
	} catch {
		// best-effort cleanup
	}
}

/** Скачивает по URL в файл и возвращает хеш содержимого в кодировке спецификации */
function fetchToFile(spec: PinnedDownload, filePath: string, onProgress?: ByteProgress): Promise<string> {
	return new Promise((resolve, reject) => {
		let settled = false
		let timer: ReturnType<typeof setTimeout> | undefined
		let activeReq: http.ClientRequest | undefined

		const finish = (err: Error | null, hash?: string) => {
			if (settled) {
				return
			}
			settled = true
			if (timer) {
				clearTimeout(timer)
			}
			if (err) {
				activeReq?.destroy()
				reject(err)
			} else {
				resolve(hash as string)
			}
		}
		const armTimer = () => {
			if (timer) {
				clearTimeout(timer)
			}
			timer = setTimeout(
				() => finish(new Error("Download stalled. Check your internet connection and try again.")),
				INACTIVITY_MS,
			)
		}
		armTimer()

		const request = (url: string, redirects: number) => {
			if (redirects > MAX_REDIRECTS) {
				finish(new Error("Too many redirects"))
				return
			}
			// В лог идёт только адрес без query: у редиректов GitHub там подписанные токены
			Logger.info(`[SherpaDownload] GET ${url.split("?")[0]}`)
			const protocol = url.startsWith("https:") ? https : http
			const req = protocol.get(url, { headers: { "User-Agent": "Skycode" }, timeout: 60_000 }, (res) => {
				const status = res.statusCode ?? 0
				if (status >= 300 && status < 400 && res.headers.location) {
					res.resume()
					request(new URL(res.headers.location, url).toString(), redirects + 1)
					return
				}
				if (status !== 200) {
					res.resume()
					finish(new Error(`HTTP ${status} downloading ${spec.id}`))
					return
				}
				const total = parseInt(res.headers["content-length"] || "0", 10) || spec.sizeBytes
				const hash = createHash(spec.hashAlgorithm)
				const out = fs.createWriteStream(filePath)
				let downloaded = 0
				res.on("data", (chunk: Buffer) => {
					downloaded += chunk.length
					hash.update(chunk)
					armTimer()
					onProgress?.(downloaded, total)
				})
				res.on("error", (err) => {
					out.destroy()
					finish(err)
				})
				out.on("error", (err) => finish(err))
				out.on("finish", () => {
					if (downloaded === 0) {
						finish(new Error(`Empty response downloading ${spec.id}`))
						return
					}
					finish(null, hash.digest(spec.hashEncoding))
				})
				res.pipe(out)
			})
			activeReq = req
			req.on("timeout", () => req.destroy(new Error("Connection timed out")))
			req.on("error", (err) => finish(err))
		}

		request(spec.url, 0)
	})
}
