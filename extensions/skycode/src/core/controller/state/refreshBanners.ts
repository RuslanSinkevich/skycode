import type { EmptyRequest } from "@/shared/proto/skycode/common"
import { Empty } from "@/shared/proto/skycode/common"
import type { Controller } from ".."

/**
 * Clears the banner cache and pushes fresh banners to the webview.
 * Called when the user exits Settings so new server-side banners
 * appear without waiting for the 1-hour cache expiry.
 */
export async function refreshBanners(controller: Controller, _request: EmptyRequest): Promise<Empty> {
	await controller.postStateToWebview()
	return {}
}
