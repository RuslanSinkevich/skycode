import React from "react"
import { FocusChain } from "@/components/chat/task-header/FocusChain"
import { useExtensionState } from "@/context/ExtensionStateContext"

interface TaskSectionProps {
	lastProgressMessageText?: string
}

/**
 * Task section shown when there's an active task.
 * [SKYCODE] Строки задачи (TaskHeader) больше нет — её заменила полоса вкладок; здесь остался только чек-лист шагов.
 */
export const TaskSection: React.FC<TaskSectionProps> = ({ lastProgressMessageText }) => {
	const { currentTaskItem } = useExtensionState()
	return (
		<div className="py-2 px-4 flex flex-col gap-2">
			<FocusChain currentTaskItemId={currentTaskItem?.id} lastProgressMessageText={lastProgressMessageText} />
		</div>
	)
}
