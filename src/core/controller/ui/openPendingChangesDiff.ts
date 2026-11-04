import * as path from "node:path"
import type { Controller } from "@core/controller"
import { getDiffSystem } from "@core/diff-v2/DiffSystem"
import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { getWorkspacePath } from "@/utils/path"

/**
 * [SKYCODE] Клик по файлу в нижней панели изменений или по «Создан / Изменён» в чате:
 * стандартное окно сравнения «до агента ↔ сейчас» (зелёное/красное, откат по кускам —
 * средствами VS Code). Путь может быть относительным — от корня проекта.
 *
 * Если сравнивать не с чем (правки уже приняты) — ошибка: webview откроет сам файл
 * на месте правки.
 */
export async function openPendingChangesDiff(_controller: Controller, request: StringRequest): Promise<Empty> {
	const value = request.value
	if (!value) {
		return Empty.create({})
	}
	const fsPath = path.isAbsolute(value) ? value : path.resolve(await getWorkspacePath(), value)
	if (!(await getDiffSystem().openBaselineDiff(fsPath))) {
		throw new Error("No pending changes for this file")
	}
	return Empty.create({})
}
