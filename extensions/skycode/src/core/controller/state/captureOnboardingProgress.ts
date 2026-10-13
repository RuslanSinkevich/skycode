import { Empty } from "@shared/proto/skycode/common"
import { OnboardingProgressRequest } from "@shared/proto/skycode/state"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

/**
 * Captures the onboarding progress step
 * @param controller The controller instance
 * @param request The request containing the step number
 * @returns Empty response
 */
export async function captureOnboardingProgress(_controller: Controller, request: OnboardingProgressRequest): Promise<Empty> {
	try {
		return Empty.create({})
	} catch (error) {
		Logger.error("Failed to set welcome view completed:", error)
		throw error
	}
}
