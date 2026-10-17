import * as vscode from "vscode"

/**
 * [SKYCODE] Вкладка редактора со статичной визуализацией из чата. Скрипты выключены самой панелью
 * и CSP — даже пропущенный скрипт не выполнится. Переменные темы (--vscode-*) доступны сами.
 */
export function openVisualPanel(title: string, html: string): void {
	const panel = vscode.window.createWebviewPanel("skycode.visual", title, vscode.ViewColumn.Active, {
		enableScripts: false,
		enableCommandUris: false,
	})
	const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src https: data:;">`
	panel.webview.html = html.replace("<head>", `<head>${csp}`)
}
