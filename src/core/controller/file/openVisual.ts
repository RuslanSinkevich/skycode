import { Empty, StringRequest } from "@shared/proto/skycode/common"
import { openVisualPanel } from "@/hosts/vscode/visualPanel"
import { Logger } from "@/shared/services/Logger"
import { Controller } from ".."

/**
 * [SKYCODE] Открывает визуализацию из чата во вкладке редактора — на всю его ширину, а не в узкой
 * боковой панели. value — JSON { title, html }; документ собирает и очищает вебвью.
 */
export async function openVisual(_controller: Controller, request: StringRequest): Promise<Empty> {
	try {
		const { title, html } = JSON.parse(request.value || "{}") as { title?: string; html?: string }
		if (html) {
			openVisualPanel(title || "Skycode", html)
		}
	} catch (error) {
		Logger.error("[openVisual] Failed to open the visual:", error)
	}
	return Empty.create()
}
