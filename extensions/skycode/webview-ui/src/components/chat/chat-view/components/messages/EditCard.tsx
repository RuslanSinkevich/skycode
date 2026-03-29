import { SkycodeMessage, SkycodeSayTool } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { FileCode2Icon, FileMinus2Icon, FilePlus2Icon, PencilIcon } from "lucide-react"
import { memo, useCallback, useEffect, useMemo, useRef } from "react"
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

	// Extract diff preview lines from content (no limit — blocks are small)
	const preview = useMemo(() => {
		if (!tool.content) {
			return null
		}
		const lines = tool.content.split("\n")
		if (lines.length === 0) {
			return null
		}
		return lines
	}, [tool.content])

	// Авто-скролл вниз при стриминге (пока сообщение partial)
	const previewRef = useRef<HTMLPreElement>(null)
	useEffect(() => {
		if (message.partial && previewRef.current) {
			previewRef.current.scrollTop = previewRef.current.scrollHeight
		}
	}, [preview, message.partial])

	return (
		<div className="px-4 py-1">
			<button
				className="w-full text-left rounded border border-description/10 bg-black/10 hover:bg-black/20 transition-colors cursor-pointer p-2"
				onClick={handleClick}
				type="button">
				{/* Header */}
				<div className="flex items-center gap-1.5 text-[12px]">
					<Icon className={cn("size-3.5 shrink-0", accent)} />
					<span className={cn("font-medium", accent)}>{label}</span>
					<span className="text-description opacity-70 truncate">{cleanPath}</span>
					{startLine && <span className="text-description opacity-40 text-[11px] ml-auto shrink-0">:{startLine}</span>}
				</div>

			{/* Diff preview */}
			{preview && (
				<pre ref={previewRef} className="mt-1 text-[10px] leading-[15px] opacity-50 whitespace-pre-wrap break-words font-mono max-h-[200px] overflow-y-auto">
					{preview.map((line, i) => (
						<div
							className={cn({
								"text-red-400/70": line.startsWith("-"),
								"text-green-400/70": line.startsWith("+"),
							})}
							// biome-ignore lint/suspicious/noArrayIndexKey: diff lines can repeat, index needed for stable key
							key={`${line}-${i}`}>
							{line}
						</div>
					))}
				</pre>
			)}
			</button>
		</div>
	)
})

EditCard.displayName = "EditCard"
