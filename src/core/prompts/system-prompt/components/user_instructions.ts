import { SystemPromptSection } from "../templates/placeholders"
import { TemplateEngine } from "../templates/TemplateEngine"
import type { PromptVariant, SystemPromptContext } from "../types"

// [SKYCODE] Раньше здесь стояло «follow … without interfering with the TOOL USE guidelines»
// (текст из Cline). Модель читала это как «правила пользователя — второй сорт» и при конфликте
// выбирала поведение режима: ACT напоминает о себе рядом с каждым сообщением, а правила лежат
// один раз в конце системного промпта. Теперь приоритет задан прямо: выше правил только формат
// вызова инструментов и безопасность.
const USER_CUSTOM_INSTRUCTIONS_TEMPLATE_TEXT = `USER'S CUSTOM INSTRUCTIONS

The following instructions come from the user. They take precedence over your own defaults and over the default behaviour of the current mode. In particular, if an instruction tells you to present a plan, ask for confirmation or wait for explicit approval before changing anything, that applies in every mode — ACT MODE included.

Only two things outrank these instructions: the tool-call format described above, and refusing genuinely harmful work. Never break either one to satisfy an instruction, and never use them as an excuse to skip an instruction you simply find inconvenient.

{{CUSTOM_INSTRUCTIONS}}`

export async function getUserInstructions(variant: PromptVariant, context: SystemPromptContext): Promise<string | undefined> {
	const customInstructions = buildUserInstructions(
		context.globalSkycodeRulesFileInstructions,
		context.localSkycodeRulesFileInstructions,
		context.localCursorRulesFileInstructions,
		context.localCursorRulesDirInstructions,
		context.localWindsurfRulesFileInstructions,
		context.localAgentsRulesFileInstructions,
		context.skycodeIgnoreInstructions,
		context.preferredLanguageInstructions,
	)

	if (!customInstructions) {
		return undefined
	}

	const template =
		variant.componentOverrides?.[SystemPromptSection.USER_INSTRUCTIONS]?.template || USER_CUSTOM_INSTRUCTIONS_TEMPLATE_TEXT

	return new TemplateEngine().resolve(template, context, {
		CUSTOM_INSTRUCTIONS: customInstructions,
	})
}

function buildUserInstructions(
	globalSkycodeRulesFileInstructions?: string,
	localSkycodeRulesFileInstructions?: string,
	localCursorRulesFileInstructions?: string,
	localCursorRulesDirInstructions?: string,
	localWindsurfRulesFileInstructions?: string,
	localAgentsRulesFileInstructions?: string,
	skycodeIgnoreInstructions?: string,
	preferredLanguageInstructions?: string,
): string | undefined {
	const customInstructions = []
	if (preferredLanguageInstructions) {
		customInstructions.push(preferredLanguageInstructions)
	}
	if (globalSkycodeRulesFileInstructions) {
		customInstructions.push(globalSkycodeRulesFileInstructions)
	}
	if (localSkycodeRulesFileInstructions) {
		customInstructions.push(localSkycodeRulesFileInstructions)
	}
	if (localCursorRulesFileInstructions) {
		customInstructions.push(localCursorRulesFileInstructions)
	}
	if (localCursorRulesDirInstructions) {
		customInstructions.push(localCursorRulesDirInstructions)
	}
	if (localWindsurfRulesFileInstructions) {
		customInstructions.push(localWindsurfRulesFileInstructions)
	}
	if (localAgentsRulesFileInstructions) {
		customInstructions.push(localAgentsRulesFileInstructions)
	}
	if (skycodeIgnoreInstructions) {
		customInstructions.push(skycodeIgnoreInstructions)
	}
	if (customInstructions.length === 0) {
		return undefined
	}
	return customInstructions.join("\n\n")
}
