import { GlobalStateAndSettings, RemoteConfigFields } from "@shared/storage/state-keys"
import { ApiProvider } from "@/shared/api"
import { Logger } from "@/shared/services/Logger"
import { StateManager } from "../StateManager"

export function clearRemoteConfig() {
	try {
		const stateManager = StateManager.get()

		stateManager.clearRemoteConfig()
		// the remote config skycode rules toggle state is stored in global state
		stateManager.setGlobalState("remoteRulesToggles", {})
		stateManager.setGlobalState("remoteWorkflowToggles", {})

		// clear secrets
		stateManager.setSecret("remoteLiteLlmApiKey", undefined)
	} catch (err) {
		Logger.error("[REMOTE CONFIG] Failed to clear remote config", err)
	}
}

const isProviderValid = (provider?: ApiProvider, remoteConfig?: Partial<RemoteConfigFields>) => {
	const remoteConfiguredProviders =
		remoteConfig?.remoteConfiguredProviders ?? StateManager.get().getRemoteConfigSettings().remoteConfiguredProviders
	if (!remoteConfiguredProviders || !remoteConfiguredProviders.length) {
		return true
	}

	return provider && remoteConfiguredProviders.includes(provider)
}

/**
 * Receives a config and returns the subset of fields that can be overriden in the cache
 */
export function filterAllowedRemoteConfigFields(config: Partial<GlobalStateAndSettings>): Partial<GlobalStateAndSettings> {
	const updatedFields: Partial<GlobalStateAndSettings> = {}

	const actModeApiProvider = config.actModeApiProvider
	if (isProviderValid(actModeApiProvider)) {
		updatedFields.actModeApiProvider = actModeApiProvider
	}

	const planModeApiProvider = config.planModeApiProvider
	if (isProviderValid(planModeApiProvider)) {
		updatedFields.planModeApiProvider = planModeApiProvider
	}

	return updatedFields
}
