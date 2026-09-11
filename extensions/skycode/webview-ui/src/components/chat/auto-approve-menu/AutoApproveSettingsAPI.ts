import { AutoApprovalSettings } from "@shared/AutoApprovalSettings"
import { StateServiceClient } from "@/services/grpc-client"

/**
 * Updates auto approval settings using the gRPC/Protobus client
 * @param settings The auto approval settings to update
 * @throws Error if the update fails
 */
export async function updateAutoApproveSettings(settings: AutoApprovalSettings) {
	try {
		// allowedCommandPatterns is a repeated proto field: the wire type wants a list,
		// while the settings type leaves it optional until the user adds a pattern.
		await StateServiceClient.updateAutoApprovalSettings({
			metadata: {},
			...settings,
			actions: { ...settings.actions, allowedCommandPatterns: settings.actions.allowedCommandPatterns ?? [] },
		})
	} catch (error) {
		console.error("Failed to update auto approval settings:", error)
		throw error
	}
}
