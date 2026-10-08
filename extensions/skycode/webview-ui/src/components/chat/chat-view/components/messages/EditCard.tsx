import { SkycodeMessage, SkycodeSayTool } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { FileCode2Icon, FileMinus2Icon, FilePlus2Icon, PencilIcon } from "lucide-react"
import { memo, useCallback, useMemo } from "react"
import { cleanPathPrefix } from "@/components/common/CodeAccordian"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { FileServiceClient } from "@/services/grpc-client"

interface EditCardProps {
	message: SkycodeMessage
}

/**
 * EditCard — compact card showing a file edit/create/delete in the main chat.
 * Clickable — opens the file at the edit location.
 */
export const EditCard = memo(({ message }: EditCardProps) => {
	const { t } = useI18n()
	const tool = useMemo(() => {
		try {
			return JSON.parse(message.text || "{}") as SkycodeSayTool
		} catch {
			return {} as SkycodeSayTool
		}
	}, [message.text])

	const filePath = tool.path || ""
	const cleanPath = filePath ? cleanPathPrefix(filePath) : "file"
	const startLine = tool.startLineNumbers?.[0]

	const {
		icon: Icon,
		label,
		accent,
	} = useMemo(() => {
		switch (tool.tool) {
			case "editedExistingFile":
				return { icon: PencilIcon, label: t("tool.edited"), accent: "text-description" }
			case "newFileCreated":
				return { icon: FilePlus2Icon, label: t("tool.created"), accent: "text-green-400" }
			case "fileDeleted":
				return { icon: FileMinus2Icon, label: t("tool.deleted"), accent: "text-red-400" }
			default:
				return { icon: FileCode2Icon, label: t("tool.changed"), accent: "text-description" }
		}
	}, [tool.tool, t])

	const hunkId = tool.hunkId

	const handleClick = useCallback(() => {
		if (!filePath) {
			return
		}
		// If hunkId present — use live position from DiffStore (survives subsequent edits)
		// Otherwise fall back to static startLine
		let target: string
		if (hunkId) {
			target = `${filePath}?hunk=${hunkId}`
		} else if (startLine) {
			target = `${filePath}:${startLine}`
		} else {
			target = filePath
		}
		FileServiceClient.openFileRelativePath(StringRequest.create({ value: target })).catch((err) =>
			console.error("Failed to open file:", err),
		)
	}, [filePath, startLine, hunkId])

	// [SKYCODE] Вместо развёрнутого превью диффа — его объём одной парой чисел.
	// Сам дифф уже виден подсветкой в редакторе и в баре изменений внизу, а в чате он
	// занимал полэкрана и автоскроллился на стриминге. Клик по строке и так ведёт на правку,
	// поэтому разворачивать нечего — но масштаб правки по строке понятен без перехода.
	const { added, removed } = useMemo(() => {
		if (!tool.content) {
			return { added: 0, removed: 0 }
		}
		let plus = 0
		let minus = 0
		for (const line of tool.content.split("\n")) {
			// `---` разделяет блоки, `@@ line N @@` — заголовок, `+++/---` — шапка диффа
			if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
				continue
			}
			if (line.startsWith("+")) {
				plus++
			} else if (line.startsWith("-")) {
				minus++
			}
		}
		return { added: plus, removed: minus }
	}, [tool.content])

	return (
		<div className="px-4 py-0.5">
			<button
				className="flex items-center gap-1.5 w-full text-left text-[12px] cursor-pointer hover:underline decoration-description/40"
				onClick={handleClick}
				title={filePath}
				type="button">
				<Icon className={cn("size-3.5 shrink-0", accent)} />
				<span className={cn("font-medium shrink-0", accent)}>{label}</span>
				<span className="text-description opacity-70 truncate">{cleanPath}</span>
				{added > 0 && <span className="text-green-400/80 shrink-0 text-[11px]">+{added}</span>}
				{removed > 0 && <span className="text-red-400/80 shrink-0 text-[11px]">−{removed}</span>}
				{startLine && <span className="text-description opacity-40 text-[11px] shrink-0">:{startLine}</span>}
			</button>
		</div>
	)
})

EditCard.displayName = "EditCard"
