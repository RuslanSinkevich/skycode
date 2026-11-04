import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { parseMemorySayPayload } from "@shared/memory"
import { Int64Request } from "@shared/proto/skycode/common"
import { BookmarkIcon } from "lucide-react"
import { memo, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { FileServiceClient } from "@/services/grpc-client"

// [SKYCODE] Служебная строка памяти (say "memory"): что агент запомнил, обновил или забыл.
// Заметнее, чем «Думал» и «Исследование» (владелец просил «средне», не прятать): полоса и значок
// цветом ссылок темы — в одной гамме с интерфейсом (фиолетовый выбивался), текст обычной яркости.
// Клик по строке ведёт во вкладку «Память», «Отменить» откатывает действие.
const ACCENT = "var(--vscode-textLink-foreground, #3794ff)"

const MemoryRow = ({ message }: { message: SkycodeMessage }) => {
	const { t } = useI18n()
	const { navigateToSettings } = useExtensionState()
	const [pending, setPending] = useState(false)
	const payload = parseMemorySayPayload(message.text)
	if (!payload) {
		return null
	}

	const undone = payload.undone === true
	const verb = t(`memory.row.${payload.action}`)
	const scope = t(payload.scope === "project" ? "memory.scope.project" : "memory.scope.global")

	const undo = (e: React.MouseEvent) => {
		e.stopPropagation()
		if (pending || undone) {
			return
		}
		setPending(true)
		FileServiceClient.undoMemory(Int64Request.create({ value: message.ts }))
			.catch((err) => console.error("Failed to undo memory:", err))
			.finally(() => setPending(false))
	}

	return (
		<div
			className="flex items-center gap-2 my-1.5 px-2.5 py-1.5 rounded-sm cursor-pointer text-[12px] hover:brightness-110"
			onClick={() => navigateToSettings("memory")}
			role="button"
			style={{
				borderLeft: `2px solid ${ACCENT}`,
				background: `color-mix(in srgb, ${ACCENT} 7%, transparent)`,
			}}
			title={t("memory.row.openSettings")}>
			<BookmarkIcon className="shrink-0" size={13} style={{ color: ACCENT }} />
			<span className="shrink-0 font-medium" style={{ color: ACCENT }}>
				{t("memory.row.label")}
			</span>
			<span className="min-w-0 truncate">
				<span className="opacity-80">{verb} </span>
				<span className={undone ? "line-through opacity-60" : undefined}>«{payload.entry.text}»</span>
			</span>
			<span className="shrink-0 text-[11px] opacity-60">· {scope}</span>
			<span className="ml-auto shrink-0 text-[11px]">
				{undone ? (
					<span className="opacity-60">{t("memory.row.undone")}</span>
				) : (
					<button
						className="bg-transparent border-0 p-0 cursor-pointer text-(--vscode-textLink-foreground) hover:underline disabled:opacity-50"
						disabled={pending}
						onClick={undo}
						type="button">
						{t("memory.row.undo")}
					</button>
				)}
			</span>
		</div>
	)
}

export default memo(MemoryRow)
