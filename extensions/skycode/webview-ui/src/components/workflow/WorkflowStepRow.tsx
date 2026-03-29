import { ChevronDownIcon, ChevronRightIcon, GripVerticalIcon, TrashIcon } from "lucide-react"
import React, { memo, useCallback, useState } from "react"
import { cn } from "@/lib/utils"

export interface WorkflowStepData {
	name: string
	prompt: string
	enabled: boolean
	visible: boolean
}

interface WorkflowStepRowProps {
	step: WorkflowStepData
	index: number
	total: number
	onChange: (index: number, step: WorkflowStepData) => void
	onMoveUp: (index: number) => void
	onMoveDown: (index: number) => void
	onDelete: (index: number) => void
}

export const WorkflowStepRow: React.FC<WorkflowStepRowProps> = memo(
	({ step, index, total, onChange, onMoveUp, onMoveDown, onDelete }) => {
		const [isExpanded, setIsExpanded] = useState(false)

		const toggleExpand = useCallback(() => setIsExpanded((p) => !p), [])

		const updateField = useCallback(
			<K extends keyof WorkflowStepData>(field: K, value: WorkflowStepData[K]) => {
				onChange(index, { ...step, [field]: value })
			},
			[index, step, onChange],
		)

		return (
			<div
				className={cn("border rounded-sm overflow-hidden", {
					"opacity-50": !step.enabled,
					"border-l-2 border-l-blue-500": step.enabled,
				})}
				style={{ borderColor: "var(--vscode-panel-border)" }}>
				{/* Header */}
				<div className="flex items-center gap-1.5 px-2 py-1.5 bg-(--vscode-toolbar-hoverBackground)/30">
					<GripVerticalIcon className="shrink-0 opacity-40" size={14} />

					{/* Step number */}
					<span className="text-xs opacity-60 shrink-0 w-4 text-center">{index + 1}</span>

					{/* Step name (editable) */}
					<input
						className="flex-1 min-w-0 bg-transparent border-0 outline-0 text-sm text-foreground focus:outline-none"
						onChange={(e) => updateField("name", e.target.value)}
						placeholder="Step name..."
						type="text"
						value={step.name}
					/>

					{/* Enabled toggle */}
					<button
						className={cn("px-1.5 py-0.5 rounded text-xs font-medium shrink-0", {
							"bg-green-700/30 text-green-400": step.enabled,
							"bg-gray-700/30 text-gray-500": !step.enabled,
						})}
						onClick={() => updateField("enabled", !step.enabled)}
						title={step.enabled ? "Disable step" : "Enable step"}
						type="button">
						{step.enabled ? "On" : "Off"}
					</button>

					{/* Visibility toggle */}
					<button
						className="p-0.5 opacity-60 hover:opacity-100 shrink-0"
						onClick={() => updateField("visible", !step.visible)}
						title={step.visible ? "Switch to silent mode" : "Switch to visible mode"}
						type="button">
						<span
							className={cn("codicon", {
								"codicon-eye": step.visible,
								"codicon-eye-closed": !step.visible,
							})}
							style={{ fontSize: 14 }}
						/>
					</button>

					{/* Move up */}
					<button
						className="p-0.5 opacity-40 hover:opacity-100 shrink-0 disabled:opacity-20"
						disabled={index === 0}
						onClick={() => onMoveUp(index)}
						title="Move up"
						type="button">
						<span className="codicon codicon-arrow-up" style={{ fontSize: 14 }} />
					</button>

					{/* Move down */}
					<button
						className="p-0.5 opacity-40 hover:opacity-100 shrink-0 disabled:opacity-20"
						disabled={index === total - 1}
						onClick={() => onMoveDown(index)}
						title="Move down"
						type="button">
						<span className="codicon codicon-arrow-down" style={{ fontSize: 14 }} />
					</button>

					{/* Expand/collapse prompt */}
					<button
						className="p-0.5 opacity-60 hover:opacity-100 shrink-0"
						onClick={toggleExpand}
						title={isExpanded ? "Collapse prompt" : "Edit prompt"}
						type="button">
						{isExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
					</button>

					{/* Delete */}
					<button
						className="p-0.5 opacity-40 hover:opacity-100 text-red-400 shrink-0"
						onClick={() => onDelete(index)}
						title="Delete step"
						type="button">
						<TrashIcon size={14} />
					</button>
				</div>

				{/* Expanded prompt textarea */}
				{isExpanded && (
					<div className="px-3 pb-2 pt-1">
						<textarea
							className="w-full min-h-[80px] bg-(--vscode-input-background) text-(--vscode-input-foreground) border rounded-sm p-2 text-sm resize-y outline-none focus:border-blue-500"
							onChange={(e) => updateField("prompt", e.target.value)}
							placeholder="Instructions for this step..."
							style={{ borderColor: "var(--vscode-input-border)" }}
							value={step.prompt}
						/>
					</div>
				)}
			</div>
		)
	},
)

WorkflowStepRow.displayName = "WorkflowStepRow"
