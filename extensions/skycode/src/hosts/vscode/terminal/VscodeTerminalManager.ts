import { SkycodeTempManager } from "@services/temp"
import { arePathsEqual } from "@utils/path"
import { getShellForProfile } from "@utils/shell"
import pWaitFor from "p-wait-for"
import * as fs from "fs"
import * as vscode from "vscode"
import { BACKGROUND_COMMAND_TIMEOUT_MS } from "@/integrations/terminal/constants"
import {
	BackgroundCommand,
	TerminalInfo as ITerminalInfo,
	ITerminalManager,
	TerminalProcessResultPromise as ITerminalProcessResultPromise,
} from "@/integrations/terminal/types"
import { Logger } from "@/shared/services/Logger"
import { mergePromise, VscodeTerminalProcess } from "./VscodeTerminalProcess"
import { TerminalInfo, TerminalRegistry } from "./VscodeTerminalRegistry"

/*
TerminalManager:
- Creates/reuses terminals
- Runs commands via runCommand(), returning a TerminalProcess
- Handles shell integration events

TerminalProcess extends EventEmitter and implements Promise:
- Emits 'line' events with output while promise is pending
- process.continue() resolves promise and stops event emission
- Allows real-time output handling or background execution

getUnretrievedOutput() fetches latest output for ongoing commands

Enables flexible command execution:
- Await for completion
- Listen to real-time events
- Continue execution in background
- Retrieve missed output later

Notes:
- it turns out some shellIntegration APIs are available on cursor, although not on older versions of vscode
- "By default, the shell integration script should automatically activate on supported shells launched from VS Code."
Supported shells:
Linux/macOS: bash, fish, pwsh, zsh
Windows: pwsh


Example:

const terminalManager = new TerminalManager(context);

// Run a command
const process = terminalManager.runCommand('npm install', '/path/to/project');

process.on('line', (line) => {
	Logger.log(line);
});

// To wait for the process to complete naturally:
await process;

// Or to continue execution even if the command is still running:
process.continue();

// Later, if you need to get the unretrieved output:
const unretrievedOutput = terminalManager.getUnretrievedOutput(terminalId);
Logger.log('Unretrieved output:', unretrievedOutput);

Resources:
- https://github.com/microsoft/vscode/issues/226655
- https://code.visualstudio.com/updates/v1_93#_terminal-shell-integration-api
- https://code.visualstudio.com/docs/terminal/shell-integration
- https://code.visualstudio.com/api/references/vscode-api#Terminal
- https://github.com/microsoft/vscode-extension-samples/blob/main/terminal-sample/src/extension.ts
- https://github.com/microsoft/vscode-extension-samples/blob/main/shell-integration-sample/src/extension.ts
*/

/*
The new shellIntegration API gives us access to terminal command execution output handling.
However, we don't update our VSCode type definitions or engine requirements to maintain compatibility
with older VSCode versions. Users on older versions will automatically fall back to using sendText
for terminal command execution.
Interestingly, some environments like Cursor enable these APIs even without the latest VSCode engine.
This approach allows us to leverage advanced features when available while ensuring broad compatibility.
*/
declare module "vscode" {
	// https://github.com/microsoft/vscode/blob/f0417069c62e20f3667506f4b7e53ca0004b4e3e/src/vscode-dts/vscode.d.ts#L7442
	interface Terminal {
		shellIntegration?: {
			cwd?: vscode.Uri
			executeCommand?: (command: string) => {
				read: () => AsyncIterable<string>
			}
		}
	}
	// https://github.com/microsoft/vscode/blob/f0417069c62e20f3667506f4b7e53ca0004b4e3e/src/vscode-dts/vscode.d.ts#L10794
	interface Window {
		onDidStartTerminalShellExecution?: (
			listener: (e: any) => any,
			thisArgs?: any,
			disposables?: vscode.Disposable[],
		) => vscode.Disposable
	}
}

export class VscodeTerminalManager implements ITerminalManager {
	private terminalIds: Set<number> = new Set()
	private processes: Map<number, VscodeTerminalProcess> = new Map()
	private disposables: vscode.Disposable[] = []
	private shellIntegrationTimeout: number = 4000
	private terminalReuseEnabled: boolean = true
	private terminalOutputLineLimit: number = 500
	private subagentTerminalOutputLineLimit: number = 2000
	private defaultTerminalProfile: string = "default"

	// Background command tracking (VSCode mode) — pull-based: output is read
	// from the process's fullOutput via getUnretrievedOutput() on demand.
	private backgroundCommands: Map<string, BackgroundCommand> = new Map()
	private backgroundTimeouts: Map<string, NodeJS.Timeout> = new Map()

	constructor() {
		let disposable: vscode.Disposable | undefined
		try {
			disposable = (vscode.window as vscode.Window).onDidStartTerminalShellExecution?.(async (e) => {
				// Creating a read stream here results in a more consistent output. This is most obvious when running the `date` command.
				e?.execution?.read()
			})
		} catch (_error) {
			// Logger.error("Error setting up onDidEndTerminalShellExecution", error)
		}
		if (disposable) {
			this.disposables.push(disposable)
		}

		// Add a listener for terminal state changes to detect CWD updates
		try {
			const stateChangeDisposable = vscode.window.onDidChangeTerminalState((terminal) => {
				const terminalInfo = this.findTerminalInfoByTerminal(terminal)
				if (terminalInfo && terminalInfo.pendingCwdChange && terminalInfo.cwdResolved) {
					// Check if CWD has been updated to match the expected path
					if (this.isCwdMatchingExpected(terminalInfo)) {
						const resolver = terminalInfo.cwdResolved.resolve
						terminalInfo.pendingCwdChange = undefined
						terminalInfo.cwdResolved = undefined
						resolver()
					}
				}
			})
			this.disposables.push(stateChangeDisposable)
		} catch (error) {
			Logger.error("Error setting up onDidChangeTerminalState", error)
		}
	}

	//Find a TerminalInfo by its VSCode Terminal instance
	private findTerminalInfoByTerminal(terminal: vscode.Terminal): TerminalInfo | undefined {
		const terminals = TerminalRegistry.getAllTerminals()
		return terminals.find((t) => t.terminal === terminal)
	}

	//Check if a terminal's CWD matches its expected pending change
	private isCwdMatchingExpected(terminalInfo: TerminalInfo): boolean {
		if (!terminalInfo.pendingCwdChange) {
			return false
		}

		const currentCwd = terminalInfo.terminal.shellIntegration?.cwd?.fsPath
		const targetCwd = vscode.Uri.file(terminalInfo.pendingCwdChange).fsPath

		if (!currentCwd) {
			return false
		}

		return arePathsEqual(currentCwd, targetCwd)
	}

	runCommand(terminalInfo: ITerminalInfo, command: string): ITerminalProcessResultPromise {
		// Cast to VSCode-specific TerminalInfo for internal use
		// Using unknown as intermediate cast due to structural differences between ITerminal and vscode.Terminal
		const vscodeTerminalInfo = terminalInfo as unknown as TerminalInfo
		Logger.log(`[TerminalManager] Running command on terminal ${vscodeTerminalInfo.id}: "${command}"`)
		Logger.log(`[TerminalManager] Terminal ${vscodeTerminalInfo.id} busy state before: ${vscodeTerminalInfo.busy}`)

		vscodeTerminalInfo.busy = true
		vscodeTerminalInfo.lastCommand = command
		// NOTE: vscode.Terminal.name is read-only — a terminal can only be
		// named at creation time (createTerminal options), not renamed later.
		const process = new VscodeTerminalProcess()
		this.processes.set(vscodeTerminalInfo.id, process)

		process.once("completed", () => {
			Logger.log(`[TerminalManager] Terminal ${vscodeTerminalInfo.id} completed, setting busy to false`)
			vscodeTerminalInfo.busy = false
		})
		process.once("error", () => {
			Logger.log(`[TerminalManager] Terminal ${vscodeTerminalInfo.id} errored, setting busy to false`)
			vscodeTerminalInfo.busy = false
		})

		// if shell integration is not available, remove terminal so it does not get reused as it may be running a long-running process
		process.once("no_shell_integration", () => {
			Logger.log(`no_shell_integration received for terminal ${vscodeTerminalInfo.id}`)
			// Remove the terminal so we can't reuse it (in case it's running a long-running process)
			TerminalRegistry.removeTerminal(vscodeTerminalInfo.id)
			this.terminalIds.delete(vscodeTerminalInfo.id)
			this.processes.delete(vscodeTerminalInfo.id)
		})

		const promise = new Promise<void>((resolve, reject) => {
			process.once("continue", () => {
				resolve()
			})
			process.once("error", (error) => {
				Logger.error(`Error in terminal ${vscodeTerminalInfo.id}:`, error)
				reject(error)
			})
		})

		// if shell integration is already active, run the command immediately
		if (vscodeTerminalInfo.terminal.shellIntegration) {
			process.waitForShellIntegration = false
			process.run(vscodeTerminalInfo.terminal, command)
		} else {
			// docs recommend waiting 3s for shell integration to activate
			Logger.log(
				`[TerminalManager Test] Waiting for shell integration for terminal ${vscodeTerminalInfo.id} with timeout ${this.shellIntegrationTimeout}ms`,
			)
			pWaitFor(() => vscodeTerminalInfo.terminal.shellIntegration !== undefined, {
				timeout: this.shellIntegrationTimeout,
			})
				.then(() => {
					Logger.log(
						`[TerminalManager Test] Shell integration activated for terminal ${vscodeTerminalInfo.id} within timeout.`,
					)
				})
				.catch((err) => {
					Logger.warn(
						`[TerminalManager Test] Shell integration timed out or failed for terminal ${vscodeTerminalInfo.id}: ${err.message}`,
					)
				})
				.finally(() => {
					Logger.log(`[TerminalManager Test] Proceeding with command execution for terminal ${vscodeTerminalInfo.id}.`)
					const existingProcess = this.processes.get(vscodeTerminalInfo.id)
					if (existingProcess && existingProcess.waitForShellIntegration) {
						existingProcess.waitForShellIntegration = false
						existingProcess.run(vscodeTerminalInfo.terminal, command)
					}
				})
		}

		return mergePromise(process, promise)
	}

	async getOrCreateTerminal(cwd: string): Promise<ITerminalInfo> {
		const terminals = TerminalRegistry.getAllTerminals()
		const expectedShellPath =
			this.defaultTerminalProfile !== "default" ? getShellForProfile(this.defaultTerminalProfile) : undefined

		// Find available terminal from our pool first (created for this task)
		Logger.log(`[TerminalManager] Looking for terminal in cwd: ${cwd}`)
		Logger.log(`[TerminalManager] Available terminals: ${terminals.length}`)

		const matchingTerminal = terminals.find((t) => {
			if (t.busy) {
				Logger.log(`[TerminalManager] Terminal ${t.id} is busy, skipping`)
				return false
			}
			// Check if shell path matches current configuration
			if (t.shellPath !== expectedShellPath) {
				return false
			}
			const terminalCwd = t.terminal.shellIntegration?.cwd // one of skycode's commands could have changed the cwd of the terminal
			if (!terminalCwd) {
				Logger.log(`[TerminalManager] Terminal ${t.id} has no cwd, skipping`)
				return false
			}
			const matches = arePathsEqual(vscode.Uri.file(cwd).fsPath, terminalCwd.fsPath)
			Logger.log(`[TerminalManager] Terminal ${t.id} cwd: ${terminalCwd.fsPath}, matches: ${matches}`)
			return matches
		})
		if (matchingTerminal) {
			Logger.log(`[TerminalManager] Found matching terminal ${matchingTerminal.id} in correct cwd`)
			this.terminalIds.add(matchingTerminal.id)
			// Cast to ITerminalInfo for interface compatibility
			return matchingTerminal as unknown as ITerminalInfo
		}

		// If no non-busy terminal in the current working dir exists and terminal reuse is enabled, try to find any non-busy terminal regardless of CWD
		if (this.terminalReuseEnabled) {
			const availableTerminal = terminals.find((t) => !t.busy && t.shellPath === expectedShellPath)
			if (availableTerminal) {
				// Set up promise and tracking for CWD change
				const cwdPromise = new Promise<void>((resolve, reject) => {
					availableTerminal.pendingCwdChange = cwd
					availableTerminal.cwdResolved = { resolve, reject }
				})

				// Navigate back to the desired directory
				// Cast to ITerminalInfo for interface compatibility
				const cdProcess = this.runCommand(availableTerminal as unknown as ITerminalInfo, `cd "${cwd}"`)

				// Wait for the cd command to complete before proceeding
				await cdProcess

				// Add a small delay to ensure terminal is ready after cd
				await new Promise((resolve) => setTimeout(resolve, 100))

				// Either resolve immediately if CWD already updated or wait for event/timeout
				if (this.isCwdMatchingExpected(availableTerminal)) {
					if (availableTerminal.cwdResolved) {
						availableTerminal.cwdResolved.resolve()
					}
					availableTerminal.pendingCwdChange = undefined
					availableTerminal.cwdResolved = undefined
				} else {
					let cwdTimeout: NodeJS.Timeout | null = null
					try {
						// Wait with a timeout for state change event to resolve
						await Promise.race([
							cwdPromise,
							new Promise<void>((_, reject) => {
								cwdTimeout = setTimeout(() => reject(new Error(`CWD timeout: Failed to update to ${cwd}`)), 1000)
							}),
						])
					} catch (_err) {
						// Clear pending state on timeout
						availableTerminal.pendingCwdChange = undefined
						availableTerminal.cwdResolved = undefined
					} finally {
						if (cwdTimeout) {
							clearTimeout(cwdTimeout)
						}
					}
				}
				this.terminalIds.add(availableTerminal.id)
				// Cast to ITerminalInfo for interface compatibility
				return availableTerminal as unknown as ITerminalInfo
			}
		}

		// If all terminals are busy or don't match shell profile, create a new one with the configured shell
		const newTerminalInfo = TerminalRegistry.createTerminal(cwd, expectedShellPath)
		this.terminalIds.add(newTerminalInfo.id)
		// Cast to ITerminalInfo for interface compatibility
		return newTerminalInfo as unknown as ITerminalInfo
	}

	getTerminals(busy: boolean): { id: number; lastCommand: string }[] {
		return Array.from(this.terminalIds)
			.map((id) => TerminalRegistry.getTerminal(id))
			.filter((t): t is TerminalInfo => t !== undefined && t.busy === busy)
			.map((t) => ({ id: t.id, lastCommand: t.lastCommand }))
	}

	getUnretrievedOutput(terminalId: number): string {
		if (!this.terminalIds.has(terminalId)) {
			return ""
		}
		const process = this.processes.get(terminalId)
		return process ? process.getUnretrievedOutput() : ""
	}

	isProcessHot(terminalId: number): boolean {
		const process = this.processes.get(terminalId)
		return process ? process.isHot : false
	}

	// =========================================================================
	// Background Command Tracking (VSCode mode)
	// =========================================================================
	// Mirrors StandaloneTerminalManager's tracking, but pull-based: the
	// VscodeTerminalProcess keeps accumulating fullOutput after continue(),
	// so we read new output via getUnretrievedOutput() instead of piping
	// "line" events (which stop after continue()).

	/**
	 * Track a command that continues running in the background after
	 * auto-proceed/timeout. Creates a log file and sets up a 10-minute
	 * hard timeout to prevent zombie processes.
	 */
	trackBackgroundCommand(
		process: ITerminalProcessResultPromise,
		command: string,
		existingOutput: string[] = [],
	): BackgroundCommand {
		const id = `background-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		const logFilePath = SkycodeTempManager.createTempFilePath("background")

		const backgroundCommand: BackgroundCommand = {
			id,
			command,
			startTime: Date.now(),
			status: "running",
			logFilePath,
			lineCount: existingOutput.length,
			process,
		}

		// Write output captured before tracking started
		if (existingOutput.length > 0) {
			fs.appendFileSync(logFilePath, existingOutput.join("\n") + "\n")
		}

		// Flush remaining output and mark completed
		process.on("completed", () => {
			if (backgroundCommand.status !== "running") {
				return
			}
			this.flushVscodeBackgroundOutput(backgroundCommand)
			backgroundCommand.status = "completed"
			const timeout = this.backgroundTimeouts.get(id)
			if (timeout) {
				clearTimeout(timeout)
				this.backgroundTimeouts.delete(id)
			}
		})

		// Mark errored
		process.on("error", (error: Error) => {
			if (backgroundCommand.status !== "running") {
				return
			}
			this.flushVscodeBackgroundOutput(backgroundCommand)
			backgroundCommand.status = "error"
			const exitCodeMatch = error.message.match(/exit code (\d+)/)
			if (exitCodeMatch) {
				backgroundCommand.exitCode = parseInt(exitCodeMatch[1], 10)
			}
			const timeout = this.backgroundTimeouts.get(id)
			if (timeout) {
				clearTimeout(timeout)
				this.backgroundTimeouts.delete(id)
			}
		})

		// 10-minute hard timeout to prevent zombie processes
		const timeoutId = setTimeout(() => {
			if (backgroundCommand.status === "running") {
				backgroundCommand.status = "timed_out"
				this.flushVscodeBackgroundOutput(backgroundCommand)
				try {
					fs.appendFileSync(logFilePath, "\n[TIMEOUT] Process timed out after 10 minutes\n")
				} catch {
					// ignore
				}
			}
		}, BACKGROUND_COMMAND_TIMEOUT_MS)
		this.backgroundTimeouts.set(id, timeoutId)

		this.backgroundCommands.set(id, backgroundCommand)
		return backgroundCommand
	}

	/**
	 * Pull new output from the process's fullOutput into the log file.
	 */
	private flushVscodeBackgroundOutput(cmd: BackgroundCommand): void {
		try {
			const unretrieved = cmd.process.getUnretrievedOutput()
			if (unretrieved) {
				fs.appendFileSync(cmd.logFilePath, unretrieved + "\n")
				cmd.lineCount += unretrieved.split("\n").length
			}
		} catch {
			// ignore — process may already be disposed
		}
	}

	/** Get a specific background command by ID. */
	getBackgroundCommand(id: string): BackgroundCommand | undefined {
		return this.backgroundCommands.get(id)
	}

	/** Get all tracked background commands. */
	getAllBackgroundCommands(): BackgroundCommand[] {
		return Array.from(this.backgroundCommands.values())
	}

	/** Get only running background commands. */
	getRunningBackgroundCommands(): BackgroundCommand[] {
		return this.getAllBackgroundCommands().filter((c) => c.status === "running")
	}

	/** Check if there are any active background commands. */
	hasActiveBackgroundCommands(): boolean {
		return this.getRunningBackgroundCommands().length > 0
	}

	/**
	 * Get the current status and recent output for a background command.
	 * Flushes any new output to the log file before reading.
	 */
	getBackgroundCommandStatus(id: string):
		| {
				id: string
				command: string
				status: string
				exitCode?: number
				elapsedSeconds: number
				output: string
		  }
		| undefined {
		const cmd = this.backgroundCommands.get(id)
		if (!cmd) {
			return undefined
		}
		// Pull any new output into the log
		this.flushVscodeBackgroundOutput(cmd)
		let output = ""
		try {
			const content = fs.readFileSync(cmd.logFilePath, "utf8")
			const lines = content.split("\n")
			output = lines.slice(-200).join("\n")
		} catch {
			output = ""
		}
		return {
			id: cmd.id,
			command: cmd.command,
			status: cmd.status,
			exitCode: cmd.exitCode,
			elapsedSeconds: Math.round((Date.now() - cmd.startTime) / 1000),
			output,
		}
	}

	/** Cancel/terminate a specific background command. */
	cancelBackgroundCommand(id: string): boolean {
		const cmd = this.backgroundCommands.get(id)
		if (!cmd || cmd.status !== "running") {
			return false
		}
		const timeout = this.backgroundTimeouts.get(id)
		if (timeout) {
			clearTimeout(timeout)
			this.backgroundTimeouts.delete(id)
		}
		if (cmd.process && typeof (cmd.process as any).terminate === "function") {
			;(cmd.process as any).terminate()
		}
		cmd.status = "error"
		return true
	}

	/** Get a summary string for environment details. */
	getBackgroundCommandsSummary(): string {
		const running = this.getRunningBackgroundCommands()
		if (running.length === 0) {
			return ""
		}
		const lines = [`# Background Commands (${running.length} running)`]
		for (const c of running) {
			const duration = Math.round((Date.now() - c.startTime) / 1000 / 60)
			lines.push(`- ${c.command} (running ${duration}m, ${c.lineCount} lines, log: ${c.logFilePath})`)
		}
		return lines.join("\n")
	}

	/** Clean up all background command resources. */
	disposeBackgroundCommands(): void {
		for (const [_id, timeout] of this.backgroundTimeouts) {
			clearTimeout(timeout)
		}
		this.backgroundTimeouts.clear()
		this.backgroundCommands.clear()
	}

	disposeAll() {
		// for (const info of this.terminals) {
		// 	//info.terminal.dispose() // dont want to dispose terminals when task is aborted
		// }
		this.disposeBackgroundCommands()
		this.terminalIds.clear()
		this.processes.clear()
		this.disposables.forEach((disposable) => {
			disposable.dispose()
		})
		this.disposables = []
	}

	setShellIntegrationTimeout(timeout: number): void {
		this.shellIntegrationTimeout = timeout
	}

	setTerminalReuseEnabled(enabled: boolean): void {
		this.terminalReuseEnabled = enabled
	}

	setTerminalOutputLineLimit(limit: number): void {
		this.terminalOutputLineLimit = limit
	}

	setSubagentTerminalOutputLineLimit(limit: number): void {
		this.subagentTerminalOutputLineLimit = limit
	}

	public processOutput(outputLines: string[], overrideLimit?: number, isSubagentCommand?: boolean): string {
		const limit = isSubagentCommand
			? overrideLimit !== undefined
				? overrideLimit
				: this.subagentTerminalOutputLineLimit
			: this.terminalOutputLineLimit
		if (outputLines.length > limit) {
			const halfLimit = Math.floor(limit / 2)
			const start = outputLines.slice(0, halfLimit)
			const end = outputLines.slice(outputLines.length - halfLimit)
			return `${start.join("\n")}\n... (output truncated) ...\n${end.join("\n")}`.trim()
		}
		return outputLines.join("\n").trim()
	}

	setDefaultTerminalProfile(profileId: string): { closedCount: number; busyTerminals: TerminalInfo[] } {
		// Only handle terminal change if profile actually changed
		if (this.defaultTerminalProfile === profileId) {
			return { closedCount: 0, busyTerminals: [] }
		}

		const _oldProfileId = this.defaultTerminalProfile
		this.defaultTerminalProfile = profileId

		// Get the shell path for the new profile
		const newShellPath = profileId !== "default" ? getShellForProfile(profileId) : undefined

		// Handle terminal management for the profile change
		const result = this.handleTerminalProfileChange(newShellPath)

		// Update lastActive for any remaining terminals
		const allTerminals = TerminalRegistry.getAllTerminals()
		allTerminals.forEach((terminal) => {
			if (terminal.shellPath !== newShellPath) {
				TerminalRegistry.updateTerminal(terminal.id, { lastActive: Date.now() })
			}
		})

		return result
	}

	/**
	 * Filters terminals based on a provided criteria function
	 * @param filterFn Function that accepts TerminalInfo and returns boolean
	 * @returns Array of terminals that match the criteria
	 */
	filterTerminals(filterFn: (terminal: TerminalInfo) => boolean): TerminalInfo[] {
		const terminals = TerminalRegistry.getAllTerminals()
		return terminals.filter(filterFn)
	}

	/**
	 * Closes terminals that match the provided criteria
	 * @param filterFn Function that accepts TerminalInfo and returns boolean for terminals to close
	 * @param force If true, closes even busy terminals (with warning)
	 * @returns Number of terminals closed
	 */
	closeTerminals(filterFn: (terminal: TerminalInfo) => boolean, force: boolean = false): number {
		const terminalsToClose = this.filterTerminals(filterFn)
		let closedCount = 0

		for (const terminalInfo of terminalsToClose) {
			// Skip busy terminals unless force is true
			if (terminalInfo.busy && !force) {
				continue
			}

			// Remove from our tracking
			if (this.terminalIds.has(terminalInfo.id)) {
				this.terminalIds.delete(terminalInfo.id)
			}
			this.processes.delete(terminalInfo.id)

			// Dispose the actual terminal
			terminalInfo.terminal.dispose()

			// Remove from registry
			TerminalRegistry.removeTerminal(terminalInfo.id)

			closedCount++
		}

		return closedCount
	}

	/**
	 * Handles terminal management when the terminal profile changes
	 * @param newShellPath New shell path to use
	 * @returns Object with information about closed terminals and remaining busy terminals
	 */
	handleTerminalProfileChange(newShellPath: string | undefined): {
		closedCount: number
		busyTerminals: TerminalInfo[]
	} {
		// Close non-busy terminals with different shell path
		const closedCount = this.closeTerminals((terminal) => !terminal.busy && terminal.shellPath !== newShellPath, false)

		// Get remaining busy terminals with different shell path
		const busyTerminals = this.filterTerminals((terminal) => terminal.busy && terminal.shellPath !== newShellPath)

		return {
			closedCount,
			busyTerminals,
		}
	}

	/**
	 * Forces closure of all terminals (including busy ones)
	 * @returns Number of terminals closed
	 */
	closeAllTerminals(): number {
		return this.closeTerminals(() => true, true)
	}
}
