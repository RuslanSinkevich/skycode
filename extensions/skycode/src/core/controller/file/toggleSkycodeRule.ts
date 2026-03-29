import { getWorkspaceBasename } from "@core/workspace"
import type { ToggleSkycodeRuleRequest } from "@shared/proto/skycode/file"
import { RuleScope, ToggleSkycodeRules } from "@shared/proto/skycode/file"
import { telemetryService } from "@/services/telemetry"
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

	// Handle the three different scopes
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
		case RuleScope.REMOTE: {
			const toggles = controller.stateManager.getGlobalStateKey("remoteRulesToggles")
			toggles[rulePath] = enabled
			controller.stateManager.setGlobalState("remoteRulesToggles", toggles)
			break
		}
		default:
			throw new Error(`Invalid scope: ${scope}`)
	}

	// Track rule toggle telemetry with current task context
	if (controller.task?.ulid) {
		// Extract just the filename for privacy (no full paths)
		const ruleFileName = getWorkspaceBasename(rulePath, "Controller.toggleSkycodeRule")
		const isGlobal = scope === RuleScope.GLOBAL
		telemetryService.captureSkycodeRuleToggled(controller.task.ulid, ruleFileName, enabled, isGlobal)
	}

	// Get the current state to return in the response
	const globalToggles = controller.stateManager.getGlobalSettingsKey("globalSkycodeRulesToggles")
	const localToggles = controller.stateManager.getWorkspaceStateKey("localSkycodeRulesToggles")
	const remoteToggles = controller.stateManager.getGlobalStateKey("remoteRulesToggles")

	return ToggleSkycodeRules.create({
		globalSkycodeRulesToggles: { toggles: globalToggles },
		localSkycodeRulesToggles: { toggles: localToggles },
		remoteRulesToggles: { toggles: remoteToggles },
	})
}
