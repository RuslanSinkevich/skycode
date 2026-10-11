import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { PLATFORM_CONFIG } from "@/config/platform.config"
import { useI18n } from "@/i18n"

/** [SKYCODE] Отчёт о шагах задачи: ветка, коммит на шаг, дифф / откат / слияние. */
interface StepCommit {
	sha: string
	subject: string
	added: number
	removed: number
	files: number
	reverted: boolean
}

interface AgentGitReport {
	taskId: string
	branch: string
	baseBranch: string
	baseSha: string
	steps: StepCommit[]
}

type Action = "showChanges" | "revertStep" | "merge" | "deleteBranch"

function post(action: Action, taskId: string, sha?: string) {
	PLATFORM_CONFIG.postMessage({ type: "agentGitAction", agentGitAction: { action, taskId, sha } })
}

export function AgentGitReportCard({ text }: { text?: string }) {
	const { t } = useI18n()
	const [report, setReport] = useState<AgentGitReport | null>(() => {
		try {
			return JSON.parse(text || "null")
		} catch {
			return null
		}
	})
	const [status, setStatus] = useState<"merged" | "deleted" | null>(null)

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const msg = event.data
			if (msg?.type !== "agentGitActionResult" || msg.data?.taskId !== report?.taskId) {
				return
			}
			const { action, sha, result } = msg.data
			if (action === "revertStep" && result === "reverted") {
				setReport((r) => r && { ...r, steps: r.steps.map((s) => (s.sha === sha ? { ...s, reverted: true } : s)) })
			} else if (result === "merged" || result === "deleted") {
				setStatus(result)
			}
		}
		window.addEventListener("message", onMessage)
		return () => window.removeEventListener("message", onMessage)
	}, [report?.taskId])

	if (!report || report.steps.length === 0) {
		return null
	}
	const base = /^[0-9a-f]{40}$/.test(report.baseBranch) ? report.baseBranch.slice(0, 7) : report.baseBranch

	return (
		<div
			className="my-2 rounded border text-xs"
			style={{ borderColor: "var(--vscode-panel-border)", background: "var(--vscode-editor-background)" }}>
			<div className="flex items-center gap-2 px-2.5 py-2 border-b" style={{ borderColor: "var(--vscode-panel-border)" }}>
				<span className="codicon codicon-git-branch" style={{ fontSize: 14 }} />
				<div className="min-w-0 flex-1">
					<div className="font-medium truncate">{t("agentGit.title", { branch: report.branch })}</div>
					<div className="text-description">{t("agentGit.baseInfo", { base, count: report.steps.length })}</div>
				</div>
			</div>
			<div className="py-1">
				{report.steps.map((step) => (
					<div className="group flex items-center gap-2 px-2.5 py-1" key={step.sha}>
						<span className="codicon codicon-git-commit text-description" style={{ fontSize: 12 }} />
						<span
							className="min-w-0 flex-1 truncate"
							style={step.reverted ? { textDecoration: "line-through", opacity: 0.6 } : undefined}
							title={step.subject}>
							{step.subject}
						</span>
						{step.reverted ? (
							<span className="text-description">{t("agentGit.reverted")}</span>
						) : (
							<>
								<span
									className="font-mono"
									style={{ color: "var(--vscode-gitDecoration-addedResourceForeground)" }}>
									+{step.added}
								</span>
								<span
									className="font-mono"
									style={{ color: "var(--vscode-gitDecoration-deletedResourceForeground)" }}>
									−{step.removed}
								</span>
								{!status && (
									<button
										className="codicon codicon-discard opacity-0 group-hover:opacity-100 bg-transparent border-0 cursor-pointer text-description"
										onClick={() => post("revertStep", report.taskId, step.sha)}
										title={t("agentGit.revertStep")}
										type="button"
									/>
								)}
							</>
						)}
					</div>
				))}
			</div>
			<div
				className="flex flex-wrap items-center gap-2 px-2.5 py-2 border-t"
				style={{ borderColor: "var(--vscode-panel-border)" }}>
				{status ? (
					<span className="text-description">
						{status === "merged" ? t("agentGit.merged", { base }) : t("agentGit.deleted")}
					</span>
				) : (
					<>
						<Button onClick={() => post("showChanges", report.taskId)} size="xs" variant="secondary">
							{t("agentGit.showChanges")}
						</Button>
						<Button onClick={() => post("merge", report.taskId)} size="xs" variant="secondary">
							{t("agentGit.merge", { base })}
						</Button>
						<Button onClick={() => post("deleteBranch", report.taskId)} size="xs" variant="secondary">
							{t("agentGit.deleteBranch")}
						</Button>
					</>
				)}
			</div>
		</div>
	)
}
