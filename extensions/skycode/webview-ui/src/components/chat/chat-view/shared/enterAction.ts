export type EnterAction = "send" | "enqueue" | "sendQueued" | "none"

interface EnterActionInput {
	text: string
	/** [SKYCODE] Есть прикреплённые картинки/файлы — это тоже содержимое сообщения */
	hasAttachments?: boolean
	queueLength: number
	isAgentWorking: boolean
	/** Открыто меню слеш-команд или @-упоминаний: Enter принадлежит меню */
	menuOpen: boolean
}

/**
 * [SKYCODE] Что делает Enter в поле ввода.
 * - есть содержимое: агент работает -> в очередь, иначе -> отправка;
 * - пусто, но очередь не пуста -> отправить самое старое сообщение из очереди сейчас;
 * - иначе ничего.
 */
export function decideEnterAction({
	text,
	hasAttachments = false,
	queueLength,
	isAgentWorking,
	menuOpen,
}: EnterActionInput): EnterAction {
	if (menuOpen) {
		return "none"
	}
	if (text.trim().length > 0 || hasAttachments) {
		return isAgentWorking ? "enqueue" : "send"
	}
	return queueLength > 0 ? "sendQueued" : "none"
}
