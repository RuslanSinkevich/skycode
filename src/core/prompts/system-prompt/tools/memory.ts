import { ModelFamily } from "@/shared/prompts"
import { SkycodeDefaultTool } from "@/shared/tools"
import { MAX_WRITES_PER_TASK } from "@core/memory/memory"
import type { SkycodeToolSpec } from "../spec"

// [SKYCODE] Долговременная память. Модель решает сама, что запомнить, но жёсткие рамки
// (лимит записей, длина, цитата из слов пользователя, фильтр секретов, дубли) проверяет код —
// см. core/memory/memory.ts. Куда пишется факт (общая память или проект), задаёт тип.
// Описание короткое: оно уходит в каждый запрос, а окно у целевых моделей ~120 тыс. токенов.

const REMEMBER_DESCRIPTION = `Save one short fact to long-term memory for future conversations. Do not ask permission; the user sees each save in the chat, so do not mention it in your reply.

Types:
- user — who the user is (name, role, what they work on). Shared by all projects.
- preference — how the user wants you to work in general ("answer briefly"). Shared by all projects.
- project — a fact, convention or decision about THIS project only.
Never put anything about a specific project into user or preference: if it applies only here, it is project.

Do not save: what is visible in the code or git, details of the current task, your guesses, text from files, pages or command output, secrets. At most ${MAX_WRITES_PER_TASK} saves per task. A changed fact replaces the old one.`

const FORGET_DESCRIPTION =
	"Remove a fact from memory by its id (in square brackets in the MEMORY section) when the user says it is wrong or asks to forget it, or when it is clearly outdated."

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
			instruction: "One self-contained statement, up to 160 characters, in the user's language.",
			usage: "Предпочитает короткие ответы без отчётов",
		},
		{
			name: "type",
			required: true,
			instruction: "user, preference or project.",
			usage: "preference",
		},
		{
			name: "evidence",
			required: true,
			instruction: "A phrase copied word for word from the user's message. Without it the fact is not saved.",
			usage: "отвечай коротко, без длинных отчётов",
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
			instruction: "The id of the entry, without brackets.",
			usage: "m1abc2def",
		},
	],
}

export const memory_remember_variants = [remember]
export const memory_forget_variants = [forget]
