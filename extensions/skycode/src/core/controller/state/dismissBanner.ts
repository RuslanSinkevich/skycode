import type { StringRequest } from "@/shared/proto/skycode/common"
import { Empty } from "@/shared/proto/skycode/common"
import type { Controller } from ".."

/**
 * Dismisses a banner and sends telemetry
 * @param controller The controller instance
 * @param request The request containing the banner ID to dismiss
 * @returns Empty response
 */
export async function dismissBanner(controller: Controller, request: StringRequest): Promise<Empty> {
	const bannerId = request.value

	if (!bannerId) {
		return {}
	}
	const dismissedBanners = controller.stateManager.getGlobalStateKey("dismissedBanners") || []
	if (!dismissedBanners.some((banner) => banner.bannerId === bannerId)) {
		controller.stateManager.setGlobalState("dismissedBanners", [...dismissedBanners, { bannerId, dismissedAt: Date.now() }])
	}
	await controller.postStateToWebview()
	return {}
}
