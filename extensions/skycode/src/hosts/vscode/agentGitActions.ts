/**
 * [SKYCODE] Кнопки карточки «шаги задачи» в чате: показать изменения, откатить шаг,
 * слить ветку, удалить ветку. Работает и для текущей задачи, и для задачи из истории.
 */
import * as path from "node:path"
import * as vscode from "vscode"
import type { Controller } from "@/core/controller"
import type { AgentGitState } from "@/services/agent-git/AgentGit"
import { AgentGit } from "@/services/agent-git/AgentGit"

export type AgentGitAction = "showChanges" | "revertStep" | "merge" | "deleteBranch"

export interface AgentGitActionRequest {
	action: AgentGitAction
	taskId: string
	sha?: string
}

interface GitExtensionApi {
	toGitUri(uri: vscode.Uri, ref: string): vscode.Uri
}

async function resolveTask(
	controller: Controller,
	taskId: string,
): Promise<{ cwd: string; title: string; state: AgentGitState } | null> {
	// Ветка задачи сохраняется в историю сразу при создании — и для текущей задачи тоже.
	try {
		const { historyItem } = await controller.getTaskWithId(taskId)
		const cwd = historyItem.cwdOnTaskInitialization ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
		if (!historyItem.agentGit || !cwd) {
			return null
		}
		return { cwd, title: historyItem.task, state: historyItem.agentGit }
	} catch {
		return null
	}
}

async function confirm(message: string, action: string): Promise<boolean> {
	return (await vscode.window.showWarningMessage(message, { modal: true }, action)) === action
}

async function showChanges(git: AgentGit, state: AgentGitState): Promise<void> {
	const files = await git.changedFiles()
	if (files.length === 0) {
		void vscode.window.showInformationMessage("В ветке задачи нет изменений относительно базы")
		return
	}
	const gitApi = vscode.extensions.getExtension<{ getAPI(v: 1): GitExtensionApi }>("vscode.git")?.exports?.getAPI(1)
	if (!gitApi) {
		void vscode.window.showErrorMessage("Встроенное расширение Git недоступно")
		return
	}
	const onBranch = (await git.report())?.branch === state.branch
	const resources = files.map((file) => {
		const uri = vscode.Uri.file(path.join(git.root, file.path))
		const original = file.status === "A" ? undefined : gitApi.toGitUri(uri, state.baseSha)
		const modified = file.status === "D" ? undefined : onBranch ? uri : gitApi.toGitUri(uri, state.branch)
		return [uri, original, modified]
	})
	await vscode.commands.executeCommand("vscode.changes", `Задача: ${state.branch}`, resources)
}

/** Выполнить действие; вернуть текст для webview (обновить карточку) или null при отмене. */
export async function runAgentGitAction(controller: Controller, request: AgentGitActionRequest): Promise<string | null> {
	const resolved = await resolveTask(controller, request.taskId)
	if (!resolved) {
		void vscode.window.showErrorMessage("Не найдена ветка этой задачи")
		return null
	}
	const { cwd, title, state } = resolved
	const git = await AgentGit.open(cwd, request.taskId, title, state)
	if (!git) {
		void vscode.window.showErrorMessage("Папка задачи больше не в git-репозитории")
		return null
	}
	try {
		switch (request.action) {
			case "showChanges":
				await showChanges(git, state)
				return null
			case "revertStep": {
				if (!request.sha) {
					return null
				}
				await git.revertStep(request.sha)
				void vscode.window.showInformationMessage("Шаг откачен отдельным коммитом в ветке задачи")
				return "reverted"
			}
			case "merge": {
				const squash =
					vscode.workspace.getConfiguration("skycode.agentGit").get<string>("mergeMode", "squash") !== "merge"
				const how = squash ? "одним коммитом" : "со всеми шагами"
				if (!(await confirm(`Слить ${state.branch} в ${state.baseBranch} ${how}?`, "Слить"))) {
					return null
				}
				const subject = title.split(/\r?\n/)[0].slice(0, 72)
				await git.merge(squash, subject)
				void vscode.window.showInformationMessage(`Ветка задачи слита в ${state.baseBranch}`)
				return "merged"
			}
			case "deleteBranch": {
				if (!(await confirm(`Удалить ветку ${state.branch}? Несохранённые в других ветках шаги пропадут.`, "Удалить"))) {
					return null
				}
				await git.deleteBranch()
				void vscode.window.showInformationMessage(`Ветка ${state.branch} удалена`)
				return "deleted"
			}
		}
	} catch (error) {
		void vscode.window.showErrorMessage((error as Error).message)
	}
	return null
}
