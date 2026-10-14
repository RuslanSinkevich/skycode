/**
 * Terminal module of the VSCode extension.
 *
 * This module provides terminal management functionality:
 * - VSCode terminal API or background execution (StandaloneTerminalManager, child_process based)
 *
 * @example
 * ```typescript
 * import { StandaloneTerminalManager, ITerminalManager } from "@integrations/terminal"
 *
 * const manager: ITerminalManager = new StandaloneTerminalManager()
 * const terminalInfo = await manager.getOrCreateTerminal("/path/to/cwd")
 * const process = manager.runCommand(terminalInfo, "npm install")
 *
 * process.on("line", (line) => console.log(line))
 * await process
 * ```
 */

// Export unified command executor
export { CommandExecutor } from "./CommandExecutor"

// Export command orchestrator (shared logic)
export { findLastIndex, orchestrateCommandExecution } from "./CommandOrchestrator"

// Export standalone terminal implementations
export { StandaloneTerminal } from "./standalone/StandaloneTerminal"
export { StandaloneTerminalManager } from "./standalone/StandaloneTerminalManager"
export { StandaloneTerminalProcess } from "./standalone/StandaloneTerminalProcess"
export { StandaloneTerminalRegistry } from "./standalone/StandaloneTerminalRegistry"

// Export all types from types.ts
export type {
	// Command Executor types
	ActiveBackgroundCommand,
	AskResponse,
	CommandExecutorCallbacks,
	CommandExecutorConfig,
	FullCommandExecutorConfig,
	// Terminal types
	ITerminal,
	ITerminalManager,
	ITerminalProcess,
	ITerminalProcessResult,
	// Command Orchestrator types
	OrchestrationOptions,
	OrchestrationResult,
	StandaloneTerminalOptions,
	TerminalInfo,
	TerminalProcessEvents,
	TerminalProcessResultPromise,
} from "./types"
