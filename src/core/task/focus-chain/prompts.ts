// Prompt for initial list creation
const initial = `
# task_progress CREATION REQUIRED - ACT MODE ACTIVATED

**You've just switched from PLAN MODE to ACT MODE!**

** IMMEDIATE ACTION REQUIRED:**
1. Create a comprehensive todo list in your NEXT tool call
2. Use the task_progress parameter to provide the list
3. Format each item using markdown checklist syntax:
	- [ ] For tasks to be done
	- [x] For any tasks already completed

**Your todo/task_progress list should include:**
   - All major implementation steps
   - Testing and validation tasks
   - Documentation updates if needed
   - Final verification steps

**Example format:**\
   - [ ] Set up project structure
   - [ ] Implement core functionality
   - [ ] Add error handling
   - [ ] Write tests
   - [ ] Test implementation
   - [ ] Document changes

**Remember:** Keeping the task_progress list updated helps track progress and ensures nothing is missed.`

// For when recommending but not requiring a list
const listInstructionsRecommended = `
1. Include a todo list using the task_progress parameter in your next tool call
2. Create a comprehensive checklist of all steps needed
3. Use markdown format: - [ ] for incomplete, - [x] for complete

**Benefits of creating a todo/task_progress list now:**
	- Clear roadmap for implementation
	- Progress tracking throughout the task
	- Nothing gets forgotten or missed
	- Users can see, monitor, and edit the plan

**Example structure:**\`\`\`
- [ ] Analyze requirements
- [ ] Set up necessary files
- [ ] Implement main functionality
- [ ] Handle edge cases
- [ ] Test the implementation
- [ ] Verify results\`\`\`

Keeping the task_progress list updated helps track progress and ensures nothing is missed.`

// Prompt for reminders to update the list periodically
const reminder = `
1. To create or update a todo list, include the task_progress parameter in the next tool call
2. Review each item and update its status:
   - Mark completed items with: - [x]
   - Keep incomplete items as: - [ ]
   - Add new items if you discover additional steps
3. Modify the list as needed:
		- Add any new steps you've discovered
		- Reorder if the sequence has changed
4. Ensure the list accurately reflects the current state

**Remember:** Keeping the task_progress list updated helps track progress and ensures nothing is missed.`

const completed = `

**All {{totalItems}} items have been completed!**

**Completed Items:**
{{currentFocusChainChecklist}}

**Next Steps:**
- If the task is fully complete and meets all requirements, use attempt_completion
- If you've discovered additional work that wasn't in the original scope (new features, improvements, edge cases, etc.), create a new task_progress list with those items
- If there are related tasks or follow-up items the user might want, you can suggest them in a new checklist

**Remember:** Only use attempt_completion if you're confident the task is truly finished. If there's any remaining work, create a new focus chain list to track it.`

const planModeReminder = `
# task_progress List (Optional - Plan Mode)

While in PLAN MODE, if you've outlined concrete steps or requirements for the user, you may include a preliminary todo list using the task_progress parameter.

Reminder on how to use the task_progress parameter:

${reminder}`

const recommended = `
# task_progress RECOMMENDED

When starting a new task, it is recommended to include a todo list using the task_progress parameter.

${listInstructionsRecommended}
`

const apiRequestCount = `
# task_progress

You've made {{apiRequestCount}} API requests without a task_progress parameter. It is strongly recomended that you create one to track remaining work.

${reminder}
`

// [SKYCODE] Короткие напоминания: полный текст выше уходит один раз за задачу
const short = {
	progress: "Reminder: keep task_progress updated ({{done}}/{{total}} done). Send the full updated checklist in your next tool call.",
	userEdited: "The user edited the task_progress list ({{done}}/{{total}} done). Review it and continue:\n{{list}}",
	allDone:
		"All {{total}} task_progress items are done. If the task is finished, use attempt_completion; if there is more work, send a new task_progress list.",
	noList: "No task_progress list yet — add one in your next tool call if the task has several steps.",
	noListLate: "{{count}} requests without task_progress — add a checklist of the remaining work in your next tool call.",
	plan: "Plan mode: you may include a preliminary task_progress list if you have concrete steps.",
	switched: "Now in ACT MODE: create a task_progress checklist in your next tool call.",
}

export const FocusChainPrompts = {
	short,
	initial,
	reminder,
	recommended,
	planModeReminder,
	completed,
	apiRequestCount,
}
