import type { ToggleSkycodeRuleRequest } from "@shared/proto/skycode/file"
import { RuleScope, ToggleSkycodeRules } from "@shared/proto/skycode/file"
import { Logger } from "@/shared/services/Logger"
import type { Controller } from "../index"

/**
 * Toggles a Skycode rule (enable or disable)
 * @param controller The controller instance
 * @param request The toggle request
 * @returns The updated Skycode rule toggles
 */
export async function toggleSkycodeRule(controller: Controller, request: ToggleSkycodeRuleRequest): Promise<ToggleSkycodeRules> {
	const { scope, rulePath, enabled } = request

	if (!rulePath || typeof enabled !== "boolean" || scope === undefined) {
		Logger.error("toggleSkycodeRule: Missing or invalid parameters", {
			rulePath,
			scope,
			enabled: typeof enabled === "boolean" ? enabled : `Invalid: ${typeof enabled}`,
		})
		throw new Error("Missing or invalid parameters for toggleSkycodeRule")
	}

	// Handle the two scopes
	switch (scope) {
		case RuleScope.GLOBAL: {
			const toggles = controller.stateManager.getGlobalSettingsKey("globalSkycodeRulesToggles")
			toggles[rulePath] = enabled
			controller.stateManager.setGlobalState("globalSkycodeRulesToggles", toggles)
			break
		}
		case RuleScope.LOCAL: {
			const toggles = controller.stateManager.getWorkspaceStateKey("localSkycodeRulesToggles")
			toggles[rulePath] = enabled
			controller.stateManager.setWorkspaceState("localSkycodeRulesToggles", toggles)
			break
		}
		default:
			throw new Error(`Invalid scope: ${scope}`)
	}

	// Get the current state to return in the response
	const globalToggles = controller.stateManager.getGlobalSettingsKey("globalSkycodeRulesToggles")
	const localToggles = controller.stateManager.getWorkspaceStateKey("localSkycodeRulesToggles")

	return ToggleSkycodeRules.create({
		globalSkycodeRulesToggles: { toggles: globalToggles },
		localSkycodeRulesToggles: { toggles: localToggles },
	})
}
