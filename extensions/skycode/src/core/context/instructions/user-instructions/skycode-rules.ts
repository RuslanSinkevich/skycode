import {
	ActivatedConditionalRule,
	getRemoteRulesTotalContentWithMetadata,
	getRuleFilesTotalContentWithMetadata,
	RULE_SOURCE_PREFIX,
	RuleLoadResultWithInstructions,
	synchronizeRuleToggles,
} from "@core/context/instructions/user-instructions/rule-helpers"
import { formatResponse } from "@core/prompts/responses"
import { ensureRulesDirectoryExists, GlobalFileNames } from "@core/storage/disk"
import { StateManager } from "@core/storage/StateManager"
import { SkycodeRulesToggles } from "@shared/skycode-rules"
import { fileExistsAtPath, isDirectory, readDirectory } from "@utils/fs"
import fs from "fs/promises"
import path from "path"
import { Controller } from "@/core/controller"
import { Logger } from "@/shared/services/Logger"
import { parseYamlFrontmatter } from "./frontmatter"
import { evaluateRuleConditionals, type RuleEvaluationContext } from "./rule-conditionals"

export const getGlobalSkycodeRules = async (
	globalSkycodeRulesFilePath: string,
	toggles: SkycodeRulesToggles,
	opts?: { evaluationContext?: RuleEvaluationContext },
): Promise<RuleLoadResultWithInstructions> => {
	let combinedContent = ""
	const activatedConditionalRules: ActivatedConditionalRule[] = []

	// 1. Get file-based rules
	if (await fileExistsAtPath(globalSkycodeRulesFilePath)) {
		if (await isDirectory(globalSkycodeRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(globalSkycodeRulesFilePath)
				// Note: ruleNamePrefix explicitly set to "global" for clarity (matches the default)
				const rulesFilesTotal = await getRuleFilesTotalContentWithMetadata(
					rulesFilePaths,
					globalSkycodeRulesFilePath,
					toggles,
					{
						evaluationContext: opts?.evaluationContext,
						ruleNamePrefix: "global",
					},
				)
				if (rulesFilesTotal.content) {
					combinedContent = rulesFilesTotal.content
					activatedConditionalRules.push(...rulesFilesTotal.activatedConditionalRules)
				}
			} catch {
				Logger.error(`Failed to read .skycoderules directory at ${globalSkycodeRulesFilePath}`)
			}
		} else {
			Logger.error(`${globalSkycodeRulesFilePath} is not a directory`)
		}
	}

	// 2. Append remote config rules
	const stateManager = StateManager.get()
	const remoteConfigSettings = stateManager.getRemoteConfigSettings()
	const remoteRules = remoteConfigSettings.remoteGlobalRules || []
	const remoteToggles = stateManager.getGlobalStateKey("remoteRulesToggles") || {}
	const remoteResult = getRemoteRulesTotalContentWithMetadata(remoteRules, remoteToggles, {
		evaluationContext: opts?.evaluationContext,
	})
	if (remoteResult.content) {
		if (combinedContent) combinedContent += "\n\n"
		combinedContent += remoteResult.content
		activatedConditionalRules.push(...remoteResult.activatedConditionalRules)
	}

	// 3. Return formatted instructions
	if (!combinedContent) {
		return { instructions: undefined, activatedConditionalRules: [] }
	}

	return {
		instructions: formatResponse.skycodeRulesGlobalDirectoryInstructions(globalSkycodeRulesFilePath, combinedContent),
		activatedConditionalRules,
	}
}

export const getLocalSkycodeRules = async (
	cwd: string,
	toggles: SkycodeRulesToggles,
	opts?: { evaluationContext?: RuleEvaluationContext },
): Promise<RuleLoadResultWithInstructions> => {
	const skycodeRulesFilePath = path.resolve(cwd, GlobalFileNames.skycodeRules)

	let instructions: string | undefined
	const activatedConditionalRules: ActivatedConditionalRule[] = []

	if (await fileExistsAtPath(skycodeRulesFilePath)) {
		if (await isDirectory(skycodeRulesFilePath)) {
			try {
				const rulesFilePaths = await readDirectory(skycodeRulesFilePath, [
					[".skycoderules", "workflows"],
					[".skycoderules", "hooks"],
					[".skycoderules", "skills"],
				])

				const rulesFilesTotal = await getRuleFilesTotalContentWithMetadata(rulesFilePaths, cwd, toggles, {
					evaluationContext: opts?.evaluationContext,
					ruleNamePrefix: "workspace",
				})
				if (rulesFilesTotal.content) {
					instructions = formatResponse.skycodeRulesLocalDirectoryInstructions(cwd, rulesFilesTotal.content)
					activatedConditionalRules.push(...rulesFilesTotal.activatedConditionalRules)
				}
			} catch {
				Logger.error(`Failed to read .skycoderules directory at ${skycodeRulesFilePath}`)
			}
		} else {
			try {
				if (skycodeRulesFilePath in toggles && toggles[skycodeRulesFilePath] !== false) {
					const raw = (await fs.readFile(skycodeRulesFilePath, "utf8")).trim()
					if (raw) {
						// Keep single-file .skycoderules behavior consistent with directory/remote rules:
						// - Parse YAML frontmatter (fail-open on parse errors)
						// - Evaluate conditionals against the request's evaluation context
						const parsed = parseYamlFrontmatter(raw)
						if (parsed.hadFrontmatter && parsed.parseError) {
							// Fail-open: preserve the raw contents so the LLM can still see the author's intent.
							instructions = formatResponse.skycodeRulesLocalFileInstructions(cwd, raw)
						} else {
							const { passed, matchedConditions } = evaluateRuleConditionals(
								parsed.data,
								opts?.evaluationContext ?? {},
							)
							if (passed) {
								instructions = formatResponse.skycodeRulesLocalFileInstructions(cwd, parsed.body.trim())
								if (parsed.hadFrontmatter && Object.keys(matchedConditions).length > 0) {
									activatedConditionalRules.push({
										name: `${RULE_SOURCE_PREFIX.workspace}:${GlobalFileNames.skycodeRules}`,
										matchedConditions,
									})
								}
							}
						}
					}
				}
			} catch {
				Logger.error(`Failed to read .skycoderules file at ${skycodeRulesFilePath}`)
			}
		}
	}

	return { instructions, activatedConditionalRules }
}

export async function refreshSkycodeRulesToggles(
	controller: Controller,
	workingDirectory: string,
): Promise<{
	globalToggles: SkycodeRulesToggles
	localToggles: SkycodeRulesToggles
}> {
	// Global toggles
	const globalSkycodeRulesToggles = controller.stateManager.getGlobalSettingsKey("globalSkycodeRulesToggles")
	const globalSkycodeRulesFilePath = await ensureRulesDirectoryExists()
	const updatedGlobalToggles = await synchronizeRuleToggles(globalSkycodeRulesFilePath, globalSkycodeRulesToggles)
	controller.stateManager.setGlobalState("globalSkycodeRulesToggles", updatedGlobalToggles)

	// Local toggles
	const localSkycodeRulesToggles = controller.stateManager.getWorkspaceStateKey("localSkycodeRulesToggles")
	const localSkycodeRulesFilePath = path.resolve(workingDirectory, GlobalFileNames.skycodeRules)
	const updatedLocalToggles = await synchronizeRuleToggles(localSkycodeRulesFilePath, localSkycodeRulesToggles, "", [
		[".skycoderules", "workflows"],
		[".skycoderules", "hooks"],
		[".skycoderules", "skills"],
	])
	controller.stateManager.setWorkspaceState("localSkycodeRulesToggles", updatedLocalToggles)

	return {
		globalToggles: updatedGlobalToggles,
		localToggles: updatedLocalToggles,
	}
}
