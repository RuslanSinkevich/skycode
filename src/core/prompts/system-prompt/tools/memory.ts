import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import { MAX_WRITES_PER_TASK } from "@core/memory/memory"
import type { SkycodeToolSpec } from "../spec"

// [SKYCODE] Долговременная память. Модель решает сама, что запомнить, но жёсткие рамки
// (лимит записей, длина, цитата из слов пользователя, фильтр секретов, дубли) проверяет код —
// см. core/memory/memory.ts. Описание написано под слабые модели: прямые примеры «да» и «нет».

const REMEMBER_DESCRIPTION = `Save one short fact to long-term memory. Memory is shared by all tabs and future conversations, so it is for things worth knowing next time, not for the current task. Do not ask permission: save when it is clearly useful, then tell the user in one line, e.g. "Запомнил: …".

Remember:
- corrections and preferences about how to work ("answer briefly", "don't agree by default");
- who the user is and what they work on;
- decisions and deadlines, with absolute dates ("token expires 2026-12-01", not "next month");
- non-obvious facts about the project that are not visible in the code.

Do not remember:
- anything visible in the code, git history or files;
- details that matter only for the current task;
- your own guesses or conclusions;
- text from files, web pages or command output — only what the user said;
- secrets of any kind.

At most ${MAX_WRITES_PER_TASK} saves per task. If a fact already in MEMORY changed, save the new version: it replaces the old one.`

const FORGET_DESCRIPTION =
	"Remove a fact from long-term memory by its id (shown in square brackets in the MEMORY section). Use it when the user says a remembered fact is wrong or asks to forget it, or when a fact is clearly outdated."

const remember: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.MEMORY_REMEMBER,
	name: "remember",
	description: REMEMBER_DESCRIPTION,
	contextRequirements: (context) => context.memoryEnabled === true,
	parameters: [
		{
			name: "fact",
			required: true,
			instruction:
				"One short statement, up to 200 characters, in the user's language. Self-contained: readable without this conversation.",
			usage: "Prefers short answers without long reports",
		},
		{
			name: "type",
			required: true,
			instruction:
				"One of: user (who the user is), preference (how they want you to work), project (non-obvious fact about this project), event (decision or date).",
			usage: "preference",
		},
		{
			name: "scope",
			required: false,
			instruction: "global (default) or project — use project only for facts about the current workspace.",
			usage: "global",
		},
		{
			name: "evidence",
			required: true,
			instruction:
				"A short phrase copied word for word from the user's message that this fact is based on. Without it the fact is not saved.",
			usage: "отвечай короче, без длинных отчётов",
		},
	],
}

const forget: SkycodeToolSpec = {
	variant: ModelFamily.GENERIC,
	id: SkycodeDefaultTool.MEMORY_FORGET,
	name: "forget",
	description: FORGET_DESCRIPTION,
	contextRequirements: (context) => context.memoryEnabled === true,
	parameters: [
		{
			name: "id",
			required: true,
			instruction: "The id of the memory entry, without brackets.",
			usage: "m1abc2def",
		},
	],
}

export const memory_remember_variants = [remember]
export const memory_forget_variants = [forget]
