import { SKYCODE_ONBOARDING_MODELS } from "@/shared/skycode/onboarding"
import { OnboardingModelGroup } from "@/shared/proto/skycode/state"

let cached: OnboardingModelGroup | null = null

export function getSkycodeOnboardingModels(): OnboardingModelGroup {
	if (!cached) {
		cached = { models: [...SKYCODE_ONBOARDING_MODELS] }
	}
	return cached
}

export function clearOnboardingModelsCache(): void {
	cached = null
}
