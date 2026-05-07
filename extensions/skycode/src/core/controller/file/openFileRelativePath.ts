import * as path from "path"
import * as vscode from "vscode"
import { workspaceResolver } from "@core/workspace"
import { getDiffSystem } from "@/core/diff-v2"
import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { getWorkspacePath } from "@utils/path"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Returns true when `absolutePath` is the same as, or lies inside, `rootPath`.
 * Case-insensitive on Windows.
 */
function isPathInsideRoot(absolutePath: string, rootPath: string): boolean {
	const normalizedTarget = path.resolve(absolutePath)
	const normalizedRoot = path.resolve(rootPath)
	const relative = path.relative(normalizedRoot, normalizedTarget)
	if (relative === "" || relative === ".") {
		return true
	}
	return !relative.startsWith("..") && !path.isAbsolute(relative)
}

/**
 * Opens a file in the editor by a relative path
 * Supports format "path:lineNumber" to open at specific line
 * @param controller The controller instance
 * @param request The request message containing the relative file path in the 'value' field
 * @returns Empty response
 */
export async function openFileRelativePath(_controller: Controller, request: StringRequest): Promise<Empty> {
	const workspacePath = await getWorkspacePath()

	if (!workspacePath) {
		Logger.error("Error in openFileRelativePath: No workspace path available")
		return Empty.create()
	}

	if (request.value) {
		// Parse path:lineNumber format, or path?hunk=<hunkId> format
		let filePath = request.value
		let lineNumber: number | undefined
		let hunkId: string | undefined

		// Check for hunk ID parameter (e.g., "src/file.ts?hunk=abc123")
		const hunkMatch = request.value.match(/^(.+)\?hunk=(.+)$/)
		if (hunkMatch) {
			filePath = hunkMatch[1]
			hunkId = hunkMatch[2]
		} else {
			// Check for :lineNumber suffix (e.g., "src/file.ts:42")
			const lineMatch = request.value.match(/^(.+):(\d+)$/)
			if (lineMatch) {
				filePath = lineMatch[1]
				lineNumber = parseInt(lineMatch[2], 10)
			}
		}

		// If path is already absolute, use it directly; otherwise resolve relative to workspace
		const isAbsolute = path.isAbsolute(filePath)
		let absolutePath: string
		if (isAbsolute) {
			absolutePath = path.resolve(filePath)
		} else {
			const resolvedPath = workspaceResolver.resolveWorkspacePath(
				workspacePath,
				filePath,
				"Controller.openFileRelativePath",
			)
			absolutePath = typeof resolvedPath === "string" ? resolvedPath : resolvedPath.absolutePath
		}

		// Containment check: the resolved file must live inside one of the known workspace folders.
		// This blocks attempts from the webview / tool callers to open arbitrary absolute paths
		// (e.g. "/etc/passwd", "C:\\Users\\<user>\\.ssh\\id_rsa") or to traverse out via "..".
		const workspaceFolders = vscode.workspace.workspaceFolders ?? []
		const rootCandidates = [workspacePath, ...workspaceFolders.map((f) => f.uri.fsPath)]
		const isInsideWorkspace = rootCandidates.some((root) => root && isPathInsideRoot(absolutePath, root))
		if (!isInsideWorkspace) {
			Logger.warn(`openFileRelativePath: rejected path outside workspace: ${absolutePath}`)
			return Empty.create()
		}

		try {
			const uri = vscode.Uri.file(absolutePath)

			// Check if path is a directory — reveal in explorer instead of opening as text
			try {
				const stat = await vscode.workspace.fs.stat(uri)
				if (stat.type === vscode.FileType.Directory) {
					await vscode.commands.executeCommand("revealInExplorer", uri)
					return Empty.create()
				}
			} catch {
				// stat failed — try opening as file anyway
			}

			const options: vscode.TextDocumentShowOptions = {}

			// If hunkId provided, resolve its current position from DiffStore (live, updated by PositionTracker)
			if (hunkId) {
				try {
					const hunk = getDiffSystem().getStore().getHunk(hunkId)
					if (hunk) {
						lineNumber = hunk.currentStartLine
					}
				} catch {
					// DiffSystem not initialized or hunk not found — fall back to no line
				}
			}

			// If line number specified, set selection to that line
			if (lineNumber !== undefined && lineNumber > 0) {
				const position = new vscode.Position(lineNumber - 1, 0) // Convert to 0-indexed
				options.selection = new vscode.Range(position, position)
			}

			await vscode.window.showTextDocument(uri, options)
		} catch (error) {
			Logger.error("Error opening file:", error)
		}
	}

	return Empty.create()
}
