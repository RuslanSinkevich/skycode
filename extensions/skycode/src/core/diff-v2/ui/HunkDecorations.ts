/**
 * [SKYCODE] Подсветка правок агента только стандартными декорациями VS Code
 * (замена InlineDiffRenderer на вставках editorInsets — закрытом API, доступном лишь в форке).
 *
 *  - добавленные/изменённые строки — зелёный фон и метка на полосе прокрутки;
 *  - место удаления — красная черта над следующей строкой и метка на полосе прокрутки;
 *  - при наведении — что было до агента и ссылка на окно сравнения.
 *
 * Принять/отменить — в нижней панели изменений; разбор по кускам — в стандартном окне
 * сравнения («до агента ↔ сейчас»), где у каждого куска есть стрелка отката.
 *
 * Состояния нет: при любом изменении хранилища или набора редакторов декорации
 * пересчитываются из ожидающих кусков (store.getPendingHunksByFile).
 */
import * as vscode from "vscode"
import { t } from "../../../i18n/backend-i18n"
import { DiffStore } from "../storage/DiffStore"
import { Hunk } from "../storage/types"

const BASELINE_SCHEME = "skycode-base"
const MAX_HOVER_LINES = 20
const REFRESH_DELAY_MS = 30

const addedLineDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: new vscode.ThemeColor("diffEditor.insertedLineBackground"),
	isWholeLine: true,
	overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.addedForeground"),
	overviewRulerLane: vscode.OverviewRulerLane.Left,
})

const deletedAboveDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	borderStyle: "solid",
	borderWidth: "2px 0 0 0",
	borderColor: new vscode.ThemeColor("editorGutter.deletedBackground"),
	overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.deletedForeground"),
	overviewRulerLane: vscode.OverviewRulerLane.Left,
})

/** Удаление в самом конце файла: черта под последней строкой. */
const deletedBelowDecorationType = vscode.window.createTextEditorDecorationType({
	isWholeLine: true,
	borderStyle: "solid",
	borderWidth: "0 0 2px 0",
	borderColor: new vscode.ThemeColor("editorGutter.deletedBackground"),
	overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.deletedForeground"),
	overviewRulerLane: vscode.OverviewRulerLane.Left,
})

export class HunkDecorations implements vscode.Disposable {
	private readonly disposables: vscode.Disposable[] = []
	private store: DiffStore | null = null
	private suspendDepth = 0
	private refreshTimer: ReturnType<typeof setTimeout> | undefined

	initialize(store: DiffStore): void {
		this.store = store
		this.disposables.push(
			store.onDidChange(() => this.scheduleRefresh()),
			vscode.window.onDidChangeVisibleTextEditors(() => this.scheduleRefresh()),
			vscode.window.tabGroups.onDidChangeTabs(() => this.scheduleRefresh()),
		)
		this.scheduleRefresh()
	}

	// --- совместимость с прежним интерфейсом рендерера (DiffSystem) ---

	suspend(): void {
		this.suspendDepth++
	}

	async flush(): Promise<void> {
		if (this.suspendDepth > 0) {
			this.suspendDepth--
		}
		this.scheduleRefresh()
	}

	/** Декорации строятся из хранилища целиком — отдельного «созданного» состояния нет. */
	hasZonesFor(_hunkId: string): boolean {
		return true
	}

	async createZonesForHunk(_editor: vscode.TextEditor, _hunk: Hunk): Promise<void> {
		this.scheduleRefresh()
	}

	removeZonesForHunk(_hunkId: string): void {
		this.scheduleRefresh()
	}

	clearForFile(_fsPath: string): void {
		this.scheduleRefresh()
	}

	clearAll(): void {
		this.scheduleRefresh()
	}

	// --- отрисовка ---

	private scheduleRefresh(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer)
		}
		this.refreshTimer = setTimeout(() => {
			this.refreshTimer = undefined
			if (this.suspendDepth === 0) {
				this.refreshAll()
			}
		}, REFRESH_DELAY_MS)
	}

	private refreshAll(): void {
		const insideOwnDiff = this.editorsInsideBaselineDiff()
		for (const editor of vscode.window.visibleTextEditors) {
			if (editor.document.uri.scheme !== "file") {
				continue
			}
			const fsPath = editor.document.uri.fsPath
			const hunks = insideOwnDiff.has(fsPath.toLowerCase()) ? [] : (this.store?.getPendingHunksByFile(fsPath) ?? [])
			this.render(editor, hunks)
		}
	}

	/**
	 * Файлы, для которых на экране наше окно сравнения: там удалённое и добавленное
	 * уже раскрашивает сам VS Code — своя подсветка была бы второй (красная черта поверх
	 * красных строк). viewColumn у сторон окна сравнения ненадёжен — сверяем по пути.
	 */
	private editorsInsideBaselineDiff(): Set<string> {
		const paths = new Set<string>()
		for (const group of vscode.window.tabGroups.all) {
			const input = group.activeTab?.input
			if (input instanceof vscode.TabInputTextDiff && input.original.scheme === BASELINE_SCHEME) {
				paths.add(input.modified.fsPath.toLowerCase())
			}
		}
		return paths
	}

	private render(editor: vscode.TextEditor, hunks: Hunk[]): void {
		const lastLine = Math.max(0, editor.document.lineCount - 1)
		const added: vscode.DecorationOptions[] = []
		const deletedAbove: vscode.DecorationOptions[] = []
		const deletedBelow: vscode.DecorationOptions[] = []

		for (const hunk of hunks) {
			const addedCount = hunk.currentEndLine - hunk.currentStartLine
			const start0 = Math.max(0, hunk.currentStartLine - 1)
			const hover = hunk.removedLines.length > 0 ? this.removedHover(editor, hunk) : undefined

			if (addedCount > 0) {
				const end0 = Math.min(lastLine, start0 + addedCount - 1)
				added.push({ range: new vscode.Range(start0, 0, end0, Number.MAX_SAFE_INTEGER), hoverMessage: hover })
			} else if (hunk.removedLines.length > 0) {
				if (start0 > lastLine || (start0 === lastLine && hunk.currentStartLine > editor.document.lineCount)) {
					deletedBelow.push({ range: new vscode.Range(lastLine, 0, lastLine, 0), hoverMessage: hover })
				} else {
					deletedAbove.push({ range: new vscode.Range(start0, 0, start0, 0), hoverMessage: hover })
				}
			}
		}

		editor.setDecorations(addedLineDecorationType, added)
		editor.setDecorations(deletedAboveDecorationType, deletedAbove)
		editor.setDecorations(deletedBelowDecorationType, deletedBelow)
	}

	private removedHover(editor: vscode.TextEditor, hunk: Hunk): vscode.MarkdownString {
		const lines = hunk.removedLines
		const shown = lines.slice(0, MAX_HOVER_LINES)
		const more = lines.length > shown.length ? `\n… +${lines.length - shown.length}` : ""
		const args = encodeURIComponent(JSON.stringify([hunk.fsPath]))
		const md = new vscode.MarkdownString(undefined, true)
		md.isTrusted = { enabledCommands: ["skycode.diff.openBaselineDiff"] }
		md.appendMarkdown(`**${t("diff.hoverBefore", { count: String(lines.length) })}**\n\n`)
		md.appendCodeblock(`${shown.join("\n")}${more}`, editor.document.languageId)
		md.appendMarkdown(`\n[$(diff) ${t("diff.hoverOpenDiff")}](command:skycode.diff.openBaselineDiff?${args})`)
		return md
	}

	dispose(): void {
		if (this.refreshTimer) {
			clearTimeout(this.refreshTimer)
		}
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(addedLineDecorationType, [])
			editor.setDecorations(deletedAboveDecorationType, [])
			editor.setDecorations(deletedBelowDecorationType, [])
		}
		for (const d of this.disposables) {
			d.dispose()
		}
		this.disposables.length = 0
	}
}
