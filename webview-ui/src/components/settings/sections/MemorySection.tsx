import type { MemoryEntryView, MemoryListResponse } from "@shared/memory"
import { EmptyRequest, StringRequest } from "@shared/proto/skycode/common"
import { VSCodeButton, VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"
import { CheckIcon, PencilIcon, Trash2Icon, XIcon } from "lucide-react"
import { memo, useCallback, useEffect, useState } from "react"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { useI18n } from "@/i18n"
import { FileServiceClient } from "@/services/grpc-client"
import Section from "../Section"
import { updateSetting } from "../utils/settingsHandlers"

interface MemorySectionProps {
	renderSectionHeader: (tabId: string) => JSX.Element | null
}

const MAX_FACT_CHARS = 160

// [SKYCODE] Вкладка «Память»: включение, список записей обеих памятей (общая и проект), правка и удаление.
const MemoryEntryRow = ({ entry, onChanged }: { entry: MemoryEntryView; onChanged: () => void }) => {
	const { t } = useI18n()
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(entry.text)
	const [error, setError] = useState("")

	const save = async () => {
		const response = await FileServiceClient.updateMemoryEntry(
			StringRequest.create({ value: JSON.stringify({ id: entry.id, text: draft }) }),
		).catch(() => undefined)
		const reason = response?.value ?? "error"
		if (reason) {
			setError(t(`memory.settings.error.${reason}`))
			return
		}
		setEditing(false)
		setError("")
		onChanged()
	}

	const remove = async () => {
		await FileServiceClient.deleteMemoryEntry(StringRequest.create({ value: entry.id })).catch(() => undefined)
		onChanged()
	}

	return (
		<div className="flex items-start gap-2 px-2.5 py-2 rounded-sm mb-1.5 bg-(--vscode-textBlockQuote-background)">
			<div className="flex-1 min-w-0">
				{editing ? (
					<>
						<textarea
							autoFocus
							className="w-full text-[13px] p-1.5 rounded-sm resize-y bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border)"
							maxLength={MAX_FACT_CHARS}
							onChange={(e) => setDraft(e.target.value)}
							rows={2}
							value={draft}
						/>
						<div className="text-[11px] text-description">
							{draft.trim().length} / {MAX_FACT_CHARS}
							{error && <span className="ml-2 text-(--vscode-errorForeground)">{error}</span>}
						</div>
					</>
				) : (
					<div className="text-[13px] break-words">{entry.text}</div>
				)}
				<div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-description">
					<span>{t(`memory.type.${entry.type}`)}</span>
					<span>·</span>
					<span>{entry.updated}</span>
					{entry.status === "probation" && (
						<span
							className="px-1.5 rounded-sm border border-(--vscode-panel-border)"
							title={t("memory.settings.probationHint")}>
							{t("memory.settings.probation")}
						</span>
					)}
				</div>
			</div>
			<div className="flex shrink-0 gap-1">
				{editing ? (
					<>
						<button
							className="p-1 bg-transparent border-0 cursor-pointer"
							onClick={save}
							title={t("memory.settings.save")}
							type="button">
							<CheckIcon size={14} />
						</button>
						<button
							className="p-1 bg-transparent border-0 cursor-pointer"
							onClick={() => {
								setEditing(false)
								setDraft(entry.text)
								setError("")
							}}
							title={t("memory.settings.cancel")}
							type="button">
							<XIcon size={14} />
						</button>
					</>
				) : (
					<>
						<button
							className="p-1 bg-transparent border-0 cursor-pointer opacity-70 hover:opacity-100"
							onClick={() => setEditing(true)}
							title={t("memory.settings.edit")}
							type="button">
							<PencilIcon size={14} />
						</button>
						<button
							className="p-1 bg-transparent border-0 cursor-pointer opacity-70 hover:opacity-100"
							onClick={remove}
							title={t("memory.settings.delete")}
							type="button">
							<Trash2Icon size={14} />
						</button>
					</>
				)}
			</div>
		</div>
	)
}

const MemoryList = ({ title, entries, onChanged }: { title: string; entries: MemoryEntryView[]; onChanged: () => void }) => {
	const { t } = useI18n()
	return (
		<div className="mb-4">
			<div className="text-[12px] font-medium uppercase tracking-wide text-description mb-2">{title}</div>
			{entries.length === 0 ? (
				<p className="text-xs text-description">{t("memory.settings.empty")}</p>
			) : (
				entries.map((entry) => <MemoryEntryRow entry={entry} key={entry.id} onChanged={onChanged} />)
			)}
		</div>
	)
}

const MemorySection = ({ renderSectionHeader }: MemorySectionProps) => {
	const { t } = useI18n()
	const { memoryEnabled } = useExtensionState()
	const [data, setData] = useState<MemoryListResponse | null>(null)

	const refresh = useCallback(() => {
		FileServiceClient.getMemory(EmptyRequest.create({}))
			.then((response) => setData(JSON.parse(response.value || "null") as MemoryListResponse | null))
			.catch((err) => console.error("Failed to load memory:", err))
	}, [])

	useEffect(() => {
		refresh()
	}, [refresh])

	return (
		<div>
			{renderSectionHeader("memory")}
			<Section>
				<div className="mb-4">
					<VSCodeCheckbox
						checked={memoryEnabled ?? true}
						onChange={(e: any) => updateSetting("memoryEnabled", e.target.checked === true)}>
						{t("memory.settings.enable")}
					</VSCodeCheckbox>
					<p className="text-xs text-(--vscode-descriptionForeground)">{t("features.memoryDescription")}</p>
				</div>

				{data && (
					<>
						<MemoryList entries={data.global} onChanged={refresh} title={t("memory.settings.global")} />
						{data.projectFolder && (
							<MemoryList
								entries={data.project}
								onChanged={refresh}
								title={t("memory.settings.project", { folder: data.projectFolder })}
							/>
						)}
					</>
				)}

				<div className="flex gap-2">
					<VSCodeButton
						appearance="secondary"
						onClick={() =>
							FileServiceClient.openMemoryFile(EmptyRequest.create({})).catch((err) =>
								console.error("Failed to open memory file:", err),
							)
						}>
						{t("features.memoryOpenFile")}
					</VSCodeButton>
					<VSCodeButton appearance="secondary" onClick={refresh}>
						{t("memory.settings.refresh")}
					</VSCodeButton>
				</div>
			</Section>
		</div>
	)
}

export default memo(MemorySection)
