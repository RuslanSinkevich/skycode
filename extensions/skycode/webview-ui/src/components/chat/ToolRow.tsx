import {
	FileCode2Icon,
	FilePlus2Icon,
	FoldVerticalIcon,
	ImageUpIcon,
	LightbulbIcon,
	Link2Icon,
	PencilIcon,
	SearchIcon,
	SquareArrowOutUpRightIcon,
	SquareMinusIcon,
} from "lucide-react"
import type { SkycodeMessage, SkycodeSayTool } from "@shared/ExtensionMessage"
import { StringRequest } from "@shared/proto/skycode/common"
import { cn } from "@/lib/utils"
import { FileServiceClient, UiServiceClient } from "@/services/grpc-client"
import { useI18n } from "@/i18n"
import CodeAccordian, { cleanPathPrefix } from "../common/CodeAccordian"
import { DiffEditRow } from "./DiffEditRow"
import SearchResultsDisplay from "./SearchResultsDisplay"

const HEADER_CLASSNAMES = "flex items-center gap-2.5 mb-3"

const COLOR_MAP = {
	red: "var(--vscode-errorForeground)",
	yellow: "var(--vscode-editorWarning-foreground)",
	green: "var(--vscode-charts-green)",
} as const

function CodiconIcon({ name, color, rotation, title }: { name: string; color?: string; rotation?: number; title?: string }) {
	return (
		<span
			className={`codicon codicon-${name} ph-no-capture`}
			style={{
				color: color ? COLOR_MAP[color as keyof typeof COLOR_MAP] || color : "var(--vscode-foreground)",
				marginBottom: "-1.5px",
				transform: rotation ? `rotate(${rotation}deg)` : undefined,
			}}
			title={title}
		/>
	)
}

function OutsideWorkspaceIcon({ title }: { title: string }) {
	return <CodiconIcon name="sign-out" color="yellow" rotation={-90} title={title} />
}

const InvisibleSpacer = () => <div aria-hidden className="h-px" />

function isImageFile(filePath: string): boolean {
	const imageExtensions = [".png", ".jpg", ".jpeg", ".webp"]
	const extension = filePath.toLowerCase().split(".").pop()
	return extension ? imageExtensions.includes(`.${extension}`) : false
}

interface ToolRowProps {
	tool: SkycodeSayTool
	message: SkycodeMessage
	backgroundEditEnabled: boolean
	isExpanded: boolean
	onToggleExpand: () => void
}

export function ToolRow({ tool, message, backgroundEditEnabled, isExpanded, onToggleExpand }: ToolRowProps) {
	const { t } = useI18n()
	const outsideWs = tool.operationIsLocatedInWorkspace === false

	switch (tool.tool) {
		case "editedExistingFile": {
			const content = tool?.content || ""
			const isApplyingPatch = content?.startsWith("%%bash") && !content.endsWith("*** End Patch\nEOF")
			const editToolTitle = isApplyingPatch ? t("chat.createsPatchesForFile") : t("chat.wantsToEditFile")
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<PencilIcon className="size-2" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.fileOutsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>{editToolTitle}</span>
					</div>
					{backgroundEditEnabled && tool.path && tool.content ? (
						<DiffEditRow
							isLoading={message.partial}
							patch={tool.content}
							path={tool.path}
							startLineNumbers={tool.startLineNumbers}
						/>
					) : (
						<CodeAccordian
							code={tool.content}
							isExpanded={isExpanded}
							onToggleExpand={onToggleExpand}
							path={tool.path!}
						/>
					)}
				</div>
			)
		}
		case "fileDeleted":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<SquareMinusIcon className="size-2" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.fileOutsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>{t("chat.wantsToDeleteFile")}</span>
					</div>
					<CodeAccordian
						code={tool.content}
						isExpanded={isExpanded}
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "newFileCreated":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<FilePlus2Icon className="size-2" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.fileOutsideWorkspace")} />}
						<span className="font-bold">{t("chat.wantsToCreateFile")}</span>
					</div>
					{backgroundEditEnabled && tool.path && tool.content ? (
						<DiffEditRow
							isLoading={message.partial}
							patch={tool.content}
							path={tool.path}
							startLineNumbers={tool.startLineNumbers}
						/>
					) : (
						<CodeAccordian
							code={tool.content!}
							isExpanded={isExpanded}
							isLoading={message.partial}
							onToggleExpand={onToggleExpand}
							path={tool.path!}
						/>
					)}
				</div>
			)
		case "readFile": {
			const isImage = isImageFile(tool.path || "")
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						{isImage ? <ImageUpIcon className="size-2" /> : <FileCode2Icon className="size-2" />}
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.fileOutsideWorkspace")} />}
						<span className="font-bold">{t("chat.wantsToReadFile")}</span>
					</div>
					<div className="bg-code rounded-sm overflow-hidden border border-editor-group-border">
						<div
							className={cn("text-description flex items-center cursor-pointer select-none py-2 px-2.5", {
								"cursor-default select-text": isImage,
							})}
							onClick={() => {
								if (!isImage) {
									FileServiceClient.openFile(StringRequest.create({ value: tool.content })).catch(
										(err) => console.error("Failed to open file:", err),
									)
								}
							}}>
							{tool.path?.startsWith(".") && <span>.</span>}
							{tool.path && !tool.path.startsWith(".") && <span>/</span>}
							<span className="ph-no-capture whitespace-nowrap overflow-hidden text-ellipsis mr-2 text-left [direction: rtl]">
								{cleanPathPrefix(tool.path ?? "") + "\u200E"}
							</span>
							<div className="grow" />
							{!isImage && <SquareArrowOutUpRightIcon className="size-2" />}
						</div>
					</div>
				</div>
			)
		}
		case "listFilesTopLevel":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<CodiconIcon name="folder-opened" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.outsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask" ? t("chat.wantsToListTopLevelFiles") : t("chat.listedTopLevelFiles")}
						</span>
					</div>
					<CodeAccordian
						code={tool.content!}
						isExpanded={isExpanded}
						language="shell-session"
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "listFilesRecursive":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<CodiconIcon name="folder-opened" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.outsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask"
								? t("chat.wantsToListFilesRecursive")
								: t("chat.listedFilesRecursive")}
						</span>
					</div>
					<CodeAccordian
						code={tool.content!}
						isExpanded={isExpanded}
						language="shell-session"
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "listCodeDefinitionNames":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<CodiconIcon name="file-code" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.fileOutsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask"
								? t("chat.wantsToListCodeDefinitions")
								: t("chat.listedCodeDefinitions")}
						</span>
					</div>
					<CodeAccordian
						code={tool.content!}
						isExpanded={isExpanded}
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "glob":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<CodiconIcon name="search" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.outsideWorkspace")} />}
						<span style={{ fontWeight: "bold" }}>
							{message.type === "ask" ? t("chat.wantsToSearchByPattern") : t("chat.foundFilesByPattern")}
						</span>
					</div>
					<CodeAccordian
						code={tool.content!}
						isExpanded={isExpanded}
						language="shell-session"
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "searchFiles":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<CodiconIcon name="search" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.outsideWorkspace")} />}
						<span className="font-bold">
							{t("chat.wantsToSearchInFolder")} <code className="break-all">{tool.regex}</code>:
						</span>
					</div>
					<SearchResultsDisplay
						content={tool.content!}
						filePattern={tool.filePattern}
						isExpanded={isExpanded}
						onToggleExpand={onToggleExpand}
						path={tool.path!}
					/>
				</div>
			)
		case "summarizeTask":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<FoldVerticalIcon className="size-2" />
						<span className="font-bold">{t("chat.condensingHistory")}</span>
					</div>
					<div className="bg-code overflow-hidden border border-editor-group-border rounded-[3px]">
						<div
							aria-label={isExpanded ? t("chat.collapseSummary") : t("chat.expandSummary")}
							className="text-description py-2 px-2.5 cursor-pointer select-none"
							onClick={onToggleExpand}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault()
									e.stopPropagation()
									onToggleExpand()
								}
							}}
							tabIndex={0}>
							{isExpanded ? (
								<div>
									<div className="flex items-center mb-2">
										<span className="font-bold mr-1">{t("chat.summary")}:</span>
										<div className="grow" />
										<span className="codicon codicon-chevron-up my-0.5 shrink-0" />
									</div>
									<span className="ph-no-capture break-words whitespace-pre-wrap">{tool.content}</span>
								</div>
							) : (
								<div className="flex items-center">
									<span className="ph-no-capture whitespace-nowrap overflow-hidden text-ellipsis text-left flex-1 mr-2 [direction:rtl]">
										{tool.content + "\u200E"}
									</span>
									<span className="codicon codicon-chevron-down my-0.5 shrink-0" />
								</div>
							)}
						</div>
					</div>
				</div>
			)
		case "webFetch":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<Link2Icon className="size-2" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.externalUrl")} />}
						<span className="font-bold">
							{message.type === "ask" ? t("chat.wantsToFetchUrl") : t("chat.fetchedUrl")}
						</span>
					</div>
					<div
						className="bg-code rounded-xs overflow-hidden border border-editor-group-border py-2 px-2.5 cursor-pointer select-none"
						onClick={() => {
							if (tool.path) {
								UiServiceClient.openUrl(StringRequest.create({ value: tool.path })).catch((err) => {
									console.error("Failed to open URL:", err)
								})
							}
						}}>
						<span className="ph-no-capture whitespace-nowrap overflow-hidden text-ellipsis mr-2 [direction:rtl] text-left text-link underline">
							{tool.path + "\u200E"}
						</span>
					</div>
				</div>
			)
		case "webSearch":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<SearchIcon className="size-2 rotate-90" />
						{outsideWs && <OutsideWorkspaceIcon title={t("chat.externalSearch")} />}
						<span className="font-bold">
							{message.type === "ask" ? t("chat.wantsToWebSearch") : t("chat.webSearched")}
						</span>
					</div>
					<div className="bg-code border border-editor-group-border overflow-hidden rounded-xs select-text py-[9px] px-2.5">
						<span className="ph-no-capture whitespace-nowrap overflow-hidden text-ellipsis mr-2 text-left [direction:rtl]">
							{tool.path + "\u200E"}
						</span>
					</div>
				</div>
			)
		case "useSkill":
			return (
				<div>
					<div className={HEADER_CLASSNAMES}>
						<LightbulbIcon className="size-2" />
						<span className="font-bold">{t("chat.loadedSkill")}</span>
					</div>
					<div className="bg-code border border-editor-group-border overflow-hidden rounded-xs py-[9px] px-2.5">
						<span className="ph-no-capture font-medium">{tool.path}</span>
					</div>
				</div>
			)
		default:
			return <InvisibleSpacer />
	}
}
