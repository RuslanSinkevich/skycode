import { searchWorkspaceFiles, searchWorkspaceFilesMultiroot } from "@services/search/file-search"
import { FileSearchRequest, FileSearchResults, FileSearchType } from "@shared/proto/skycode/file"
import { convertSearchResultsToProtoFileInfos } from "@shared/proto-conversions/file/search-result-conversion"
import { getWorkspacePath } from "@utils/path"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * Searches for files in the workspace with fuzzy matching
 * @param controller The controller instance
 * @param request The request containing search query, and optionally a mentionsRequestId and workspace_hint
 * @returns Results containing matching files/folders
 */
export async function searchFiles(controller: Controller, request: FileSearchRequest): Promise<FileSearchResults> {
	try {
		// Map enum to string for the search service
		let selectedTypeString: "file" | "folder" | undefined
		if (request.selectedType === FileSearchType.FILE) {
			selectedTypeString = "file"
		} else if (request.selectedType === FileSearchType.FOLDER) {
			selectedTypeString = "folder"
		}

		// Extract hint, ensure workspaceManager is ready, check for multiroot
		const workspaceHint = request.workspaceHint
		const workspaceManager = await controller.ensureWorkspaceManager()
		const hasMultirootSupport = workspaceManager && workspaceManager.getRoots()?.length > 0

		let searchResults: Array<{ path: string; type: "file" | "folder"; label?: string; workspaceName?: string }>

		if (hasMultirootSupport) {
			searchResults = await searchWorkspaceFilesMultiroot(
				request.query || "",
				workspaceManager,
				request.limit || 20,
				selectedTypeString,
				workspaceHint,
			)
		} else {
			// Legacy single workspace search
			const workspacePath = await getWorkspacePath()

			if (!workspacePath) {
				Logger.error("Error in searchFiles: No workspace path available")
				return { results: [], mentionsRequestId: request.mentionsRequestId }
			}

			// Call file search service with query from request
			searchResults = await searchWorkspaceFiles(
				request.query || "",
				workspacePath,
				request.limit || 20, // Use default limit of 20 if not specified
				selectedTypeString,
			)
		}

		// Convert search results to proto FileInfo objects using the conversion function
		const protoResults = convertSearchResultsToProtoFileInfos(searchResults)

		// Return successful results
		return { results: protoResults, mentionsRequestId: request.mentionsRequestId }
	} catch (error) {
		// Log the error but don't include it in the response, following the pattern in searchCommits
		Logger.error("Error in searchFiles:", error)

		// Return empty results without error message
		return { results: [], mentionsRequestId: request.mentionsRequestId }
	}
}
