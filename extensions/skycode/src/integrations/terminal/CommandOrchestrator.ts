/**
 * CommandOrchestrator - Shared command execution orchestration logic.
 *
 * [SKYCODE] Переписано: убран рудимент Cline с ask("command_output") и
 * "Proceed While Running". Теперь:
 *  - Вывод стримится через say() и НЕ блокирует task loop.
 *  - У команды всегда есть hard timeout (передаётся снаружи).
 *  - По timeout: в standalone — уходим в background tracking, в vscode —
 *    возвращаем "ещё работает" (агент продолжает работу).
 *  - Отмена приходит только извне (CommandExecutor.cancelBackgroundCommand
 *    через UI кнопку Cancel), а не через ask().
 */

import { setTimeout as setTimeoutPromise } from "node:timers/promises"
import { processFilesIntoText as _unusedProcessFilesIntoText } from "@integrations/misc/extract-text"
import { telemetryService } from "@services/telemetry"
import { SkycodeTempManager } from "@services/temp"
import * as fs from "fs"
import { Logger } from "@/shared/services/Logger"
import {
	CHUNK_BYTE_SIZE,
	CHUNK_DEBOUNCE_MS,
	CHUNK_LINE_COUNT,
	COMPLETION_TIMEOUT_MS,
	MAX_BYTES_BEFORE_FILE,
	MAX_LINES_BEFORE_FILE,
	SUMMARY_LINES_TO_KEEP,
	VSCODE_AUTO_PROCEED_AFTER_MS,
} from "./constants"
import type {
	CommandExecutorCallbacks,
	ITerminalManager,
	OrchestrationOptions,
	OrchestrationResult,
	TerminalProcessResultPromise,
} from "./types"

// Silence unused import warning — kept for potential future use
void _unusedProcessFilesIntoText

/**
 * Orchestrate command execution with shared logic for buffering and result formatting.
 *
 * @param process The terminal process (implements ITerminalProcess)
 * @param terminalManager The terminal manager (for processOutput)
 * @param callbacks The executor callbacks for UI interaction
 * @param options Orchestration options
 * @returns The orchestration result
 */
export async function orchestrateCommandExecution(
	process: TerminalProcessResultPromise,
	terminalManager: ITerminalManager,
	callbacks: CommandExecutorCallbacks,
	options: OrchestrationOptions,
): Promise<OrchestrationResult> {
	const {
		timeoutSeconds,
		terminalType = "vscode",
		autoProceedAfterMs = terminalType === "vscode" ? VSCODE_AUTO_PROCEED_AFTER_MS : undefined,
		onOutputLine,
		onProceedWhileRunning,
	} = options

	// Track command execution state (для UI индикации "идёт команда" и Cancel кнопки)
	callbacks.updateBackgroundCommandState(true)

	let didClearCommandState = false
	const clearCommandState = async () => {
		if (didClearCommandState) {
			return
		}
		didClearCommandState = true
		callbacks.updateBackgroundCommandState(false)

		// Mark the command message as completed
		const skycodeMessages = callbacks.getSkycodeMessages()
		const lastCommandIndex = findLastIndex(skycodeMessages, (m) => m.ask === "command" || m.say === "command")
		if (lastCommandIndex !== -1) {
			await callbacks.updateSkycodeMessage(lastCommandIndex, {
				commandCompleted: true,
			})
		}
	}

	process.once("completed", clearCommandState)
	process.once("error", clearCommandState)
	process.catch(() => {
		clearCommandState()
	})

	// Когда timeout сработал и мы ушли в background — записываем сюда результат
	let backgroundTrackingResult: OrchestrationResult | null = null

	// Chunked terminal output buffering
	let outputBuffer: string[] = []
	let outputBufferSize: number = 0
	let chunkTimer: NodeJS.Timeout | null = null

	/**
	 * Flush buffered output to the UI via say() — НЕ блокирует task loop.
	 */
	const flushBuffer = async (force = false) => {
		if (outputBuffer.length === 0 && !force) {
			return
		}
		const chunk = outputBuffer.join("\n")
		outputBuffer = []
		outputBufferSize = 0
		try {
			await callbacks.say("command_output", chunk)
		} catch (error) {
			Logger.error(`Error streaming command output: ${error}`)
		}
	}

	const scheduleFlush = () => {
		if (chunkTimer) {
			clearTimeout(chunkTimer)
		}
		chunkTimer = setTimeout(async () => await flushBuffer(), CHUNK_DEBOUNCE_MS)
	}

	// Large output file-based logging state
	let isWritingToFile = false
	let largeOutputLogPath: string | null = null
	let largeOutputLogStream: fs.WriteStream | null = null
	let totalOutputBytes = 0
	let totalLineCount = 0
	let firstLines: string[] = []
	let lastLines: string[] = []

	/**
	 * Switch to file-based logging when output is too large.
	 */
	const switchToFileBased = async () => {
		if (isWritingToFile) {
			return
		}

		isWritingToFile = true

		// Flush pending buffer first
		if (outputBuffer.length > 0) {
			const chunk = outputBuffer.join("\n")
			outputBuffer = []
			outputBufferSize = 0
			await callbacks.say("command_output", chunk)
		}

		if (chunkTimer) {
			clearTimeout(chunkTimer)
			chunkTimer = null
		}

		largeOutputLogPath = SkycodeTempManager.createTempFilePath("large-output")
		largeOutputLogStream = fs.createWriteStream(largeOutputLogPath, { flags: "a" })

		if (outputLines.length > 0) {
			largeOutputLogStream.write(outputLines.join("\n") + "\n")
		}

		firstLines = outputLines.slice(0, SUMMARY_LINES_TO_KEEP)
		lastLines = outputLines.slice(-SUMMARY_LINES_TO_KEEP)

		await callbacks.say(
			"command_output",
			`\nOutput is large (${outputLines.length} lines, ${Math.round(totalOutputBytes / 1024)}KB). Writing to: ${largeOutputLogPath}`,
		)
	}

	const cleanupFileBased = () => {
		if (largeOutputLogStream) {
			largeOutputLogStream.end()
			largeOutputLogStream = null
		}
	}

	const cleanupTimersAndStreams = () => {
		if (chunkTimer) {
			clearTimeout(chunkTimer)
			chunkTimer = null
		}
		if (completionTimer) {
			clearTimeout(completionTimer)
			completionTimer = null
		}
		cleanupFileBased()
	}

	const outputLines: string[] = []
	process.on("line", async (line: string) => {
		// If background tracking is active, don't process lines here
		// The background tracker's listener will handle them
		if (backgroundTrackingResult) {
			return
		}

		const lineBytes = Buffer.byteLength(line, "utf8")
		totalOutputBytes += lineBytes
		totalLineCount++

		// Switch to file-based logging if output is too large
		if (!isWritingToFile && (outputLines.length >= MAX_LINES_BEFORE_FILE || totalOutputBytes >= MAX_BYTES_BEFORE_FILE)) {
			await switchToFileBased()
		}

		if (isWritingToFile) {
			if (largeOutputLogStream) {
				largeOutputLogStream.write(line + "\n")
			}
			lastLines.push(line)
			if (lastLines.length > SUMMARY_LINES_TO_KEEP) {
				lastLines.shift()
			}
		} else {
			outputLines.push(line)
		}

		if (onOutputLine) {
			onOutputLine(line)
		}

		// Buffered streaming via say()
		if (!isWritingToFile) {
			outputBuffer.push(line)
			outputBufferSize += lineBytes
			if (outputBuffer.length >= CHUNK_LINE_COUNT || outputBufferSize >= CHUNK_BYTE_SIZE) {
				await flushBuffer()
			} else {
				scheduleFlush()
			}
		}
	})

	let completed = false
	let completionTimer: NodeJS.Timeout | null = null

	// Start timer to detect if waiting for completion takes too long (telemetry only)
	completionTimer = setTimeout(() => {
		if (!completed) {
			telemetryService.captureTerminalHang("waiting_for_completion" as any, terminalType)
			completionTimer = null
		}
	}, COMPLETION_TIMEOUT_MS)

	process.once("completed", async () => {
		completed = true
		if (completionTimer) {
			clearTimeout(completionTimer)
			completionTimer = null
		}
		// Final flush
		if (outputBuffer.length > 0) {
			if (chunkTimer) {
				clearTimeout(chunkTimer)
				chunkTimer = null
			}
			await flushBuffer(true)
		}
	})

	process.once("no_shell_integration", async () => {
		// Без UI suggestion — просто warning
		await callbacks.say("shell_integration_warning")
	})

	// Handle timeout or wait for process completion
	if (timeoutSeconds || autoProceedAfterMs) {
		let timeoutId: NodeJS.Timeout | null = null
		let autoProceedId: NodeJS.Timeout | null = null
		const timeoutPromise = new Promise<never>((_, reject) => {
			if (timeoutSeconds) {
				timeoutId = setTimeout(() => {
					reject(new Error("COMMAND_TIMEOUT"))
				}, timeoutSeconds * 1000)
			}
		})
		const autoProceedPromise = new Promise<never>((_, reject) => {
			if (autoProceedAfterMs) {
				autoProceedId = setTimeout(() => {
					reject(new Error("COMMAND_AUTO_PROCEED"))
				}, autoProceedAfterMs)
			}
		})

		try {
			await Promise.race([process, timeoutPromise, autoProceedPromise])
		} catch (error: any) {
			if (error.message === "COMMAND_AUTO_PROCEED") {
				if (chunkTimer) {
					clearTimeout(chunkTimer)
					chunkTimer = null
				}
				if (completionTimer) {
					clearTimeout(completionTimer)
					completionTimer = null
				}

				if (outputBuffer.length > 0) {
					await flushBuffer(true)
				}

				process.continue()
				await setTimeoutPromise(50)
				const result = terminalManager.processOutput(outputLines)
				const autoProceedSeconds = Math.round((autoProceedAfterMs ?? 0) / 1000)

				cleanupFileBased()
				return {
					userRejected: false,
					result: `Command is still running after ${autoProceedSeconds}s; continuing without waiting.${result.length > 0 ? `\nOutput so far:\n${result}` : ""}`,
					completed: false,
					outputLines,
				}
			}

			if (error.message === "COMMAND_TIMEOUT") {
				// Timeout сработал — уходим в background если доступен
				if (chunkTimer) {
					clearTimeout(chunkTimer)
					chunkTimer = null
				}
				if (completionTimer) {
					clearTimeout(completionTimer)
					completionTimer = null
				}

				// Сбросим то что накопилось
				if (outputBuffer.length > 0) {
					await flushBuffer(true)
				}

				if (onProceedWhileRunning) {
					// Standalone: переключаемся на background tracking
					const trackingResult = onProceedWhileRunning(outputLines)
					const result = terminalManager.processOutput(outputLines)
					const logMsg = trackingResult?.logFilePath ? `Log file: ${trackingResult.logFilePath}\n` : ""
					const outputMsg = result.length > 0 ? `Output so far:\n${result}` : ""

					backgroundTrackingResult = {
						userRejected: false,
						result: `Command is still running after ${timeoutSeconds}s — moved to background. You can keep working; check logs later if needed.\n${logMsg}${outputMsg}`,
						completed: false,
						outputLines,
					}

					if (trackingResult?.logFilePath) {
						await callbacks.say(
							"command_output",
							`\nCommand still running after ${timeoutSeconds}s. Output logged to: ${trackingResult.logFilePath}`,
						)
					}

					process.continue()
					cleanupFileBased()
					return backgroundTrackingResult
				}

				// VSCode mode: command keeps running in the visible terminal.
				// Keep backgroundCommandRunning=true so the UI Cancel button can still
				// route to cancelBackgroundCommand() and terminate the current process.
				process.continue()
				await setTimeoutPromise(50)
				const result = terminalManager.processOutput(outputLines)

				cleanupFileBased()
				return {
					userRejected: false,
					result: `Command is still running after ${timeoutSeconds}s (process kept in terminal; Cancel can still stop it).${result.length > 0 ? `\nOutput so far:\n${result}` : ""}`,
					completed: false,
					outputLines,
				}
			}

			cleanupTimersAndStreams()
			throw error
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
			if (autoProceedId) {
				clearTimeout(autoProceedId)
			}
		}
	} else {
		// No timeout — wait for process to complete
		await process
	}

	// Background tracking сработало по timeout
	if (backgroundTrackingResult) {
		cleanupTimersAndStreams()
		return backgroundTrackingResult
	}

	if (completionTimer) {
		clearTimeout(completionTimer)
		completionTimer = null
	}

	// Wait for a short delay to ensure all messages are sent to the webview
	await setTimeoutPromise(50)

	cleanupTimersAndStreams()

	// Build result based on whether we used file-based logging
	let result: string
	let resultOutputLines: string[]

	if (isWritingToFile) {
		const skippedLines = totalLineCount - firstLines.length - lastLines.length
		const summaryLines = [...firstLines, `\n... (${skippedLines} lines written to ${largeOutputLogPath}) ...\n`, ...lastLines]
		result = terminalManager.processOutput(summaryLines)
		resultOutputLines = summaryLines
	} else {
		result = terminalManager.processOutput(outputLines)
		resultOutputLines = outputLines
	}

	const logFileMsg = largeOutputLogPath ? `\nFull output saved to: ${largeOutputLogPath}` : ""
	return {
		userRejected: false,
		result: `Command executed.${result.length > 0 ? `\nOutput:\n${result}` : ""}${logFileMsg}`,
		completed: true,
		outputLines: resultOutputLines,
		logFilePath: largeOutputLogPath || undefined,
	}
}

/**
 * Helper to find last index matching a predicate
 */
export function findLastIndex<T>(array: T[], predicate: (item: T) => boolean): number {
	for (let i = array.length - 1; i >= 0; i--) {
		if (predicate(array[i])) {
			return i
		}
	}
	return -1
}
