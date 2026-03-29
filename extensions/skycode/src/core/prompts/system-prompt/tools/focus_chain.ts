import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import type { SkycodeToolSpec } from "../spec"

// HACK: Placeholder to act as tool dependency
const generic: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.TODO,
	name: "focus_chain",
	description: "",
	contextRequirements: (context) => context.focusChainSettings?.enabled === true,
}

export const focus_chain_variants = [generic]
