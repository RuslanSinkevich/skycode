/**
 * InlineDiffRenderer — reactive View Zone manager for Cursor-like inline diffs
 *
 * Subscribes to DiffStore.onDidChange and automatically creates/removes/updates
 * View Zones when hunks are added, removed, or repositioned.
 *
 * IMPORTANT: createWebviewTextEditorInset takes a 0-based `line` parameter.
 * The extHost layer (extHostCodeInsets.ts:121) adds +1 before sending to
 * mainThread, converting to VS Code's 1-based afterLineNumber.
 *
 * Unified position formulas (0-based for the API):
 *   calculateInsetLine(hunk)   = hunk.currentStartLine - 2
 *   calculateButtonsLine(hunk) = hunk.currentStartLine + hunk.addedLines.length - 2
 *
 * hunk.currentStartLine is 1-based. Formulas convert to 0-based for the API.
 * After extHost +1: afterLineNumber = formula + 1 (back to 1-based).
 */

import * as vscode from 'vscode';
import { DiffStore } from '../storage/DiffStore';
import { Hunk, DiffStoreEvent } from '../storage/types';
import { t } from '../../../i18n/backend-i18n';
import { Logger } from "@/shared/services/Logger"

interface InsetRecord {
	inset: vscode.WebviewEditorInset;
	hunkId: string;
	fsPath: string;
	lineNumber: number;
	zoneType: 'deletion' | 'buttons';
}

// Green decoration for added lines
const addedLineDecorationType = vscode.window.createTextEditorDecorationType({
	backgroundColor: 'rgba(40, 160, 40, 0.15)',
	isWholeLine: true,
	overviewRulerColor: 'rgba(40, 160, 40, 0.6)',
	overviewRulerLane: vscode.OverviewRulerLane.Left,
});

export class InlineDiffRenderer implements vscode.Disposable {
	private readonly insets = new Map<string, InsetRecord[]>();
	/** Tracks green-line ranges per hunkId for cleanup */
	private readonly greenRanges = new Map<string, { fsPath: string; ranges: vscode.Range[] }>();
	private readonly disposables: vscode.Disposable[] = [];
	private store: DiffStore | null = null;

	/** When > 0, hunkAdded events are queued instead of rendered immediately */
	private suspendDepth = 0;
	private readonly pendingQueue: Hunk[] = [];

	/** Batched position changes — coalesced via queueMicrotask to avoid O(n²) zone rebuilds */
	private pendingPositionChanges = new Map<string, string>();
	private positionFlushScheduled = false;
	/** When true, per-hunk green decoration refresh is suppressed (batch mode) */
	private _suppressGreenRefresh = false;

	/**
	 * Mutex for in-flight createZonesForHunk operations.
	 * Prevents race: hasZonesFor() returns false, await createWebviewTextEditorInset(),
	 * meanwhile a second caller also passes the check → duplicate insets appear.
	 * Used by parallel paths: onHunkAdded + restoreZonesForEditors + flush.
	 */
	private readonly inFlightCreation = new Map<string, Promise<void>>();

	/** Hunks marked as removed after their owning hunks were dropped/rejected.
	 *  Used to filter the suspended pendingQueue at flush time so stale renderers don't fire. */
	private readonly droppedHunkIds = new Set<string>();

	// ==================== Position formulas ====================

	static calculateInsetLine(hunk: Hunk): number {
		// createWebviewTextEditorInset takes 0-based line.
		// extHost adds +1 → afterLineNumber (1-based).
		// We want zone BEFORE currentStartLine:
		//   1-based target: currentStartLine - 1
		//   0-based for API: (currentStartLine - 1) - 1 = currentStartLine - 2
		// For line 1: -1 → extHost sends 0 → afterLineNumber=0 (before first line) ✓
		return hunk.currentStartLine - 2;
	}

	static calculateButtonsLine(hunk: Hunk): number {
		// Buttons appear AFTER the last added line.
		// Use currentEndLine (1-based, exclusive) instead of addedLines.length
		// because after user edits, addedLines.length may not match actual range.
		// Last line in range (1-based) = currentEndLine - 1
		// 0-based for API: (currentEndLine - 1) - 1 = currentEndLine - 2
		return hunk.currentEndLine - 2;
	}

	// ==================== Lifecycle ====================

	initialize(store: DiffStore): void {
		this.store = store;

		this.disposables.push(
			store.onDidChange((event) => this.handleStoreChange(event)),
		);

		this.disposables.push(
			vscode.window.onDidChangeVisibleTextEditors((editors) => {
				this.restoreZonesForEditors(editors);
				this.cleanupClosedEditors();
			}),
		);
	}

	// ==================== Batch rendering (suspend / flush) ====================

	/**
	 * Suspend immediate rendering: hunkAdded events are queued.
	 * Nestable — rendering resumes only when all suspend() calls are matched by flush().
	 */
	suspend(): void {
		this.suspendDepth++;
	}

	/**
	 * Flush queued hunks and resume immediate rendering.
	 * Groups hunks by file and creates zones in parallel per file.
	 */
	async flush(): Promise<void> {
		if (this.suspendDepth > 0) { this.suspendDepth--; }
		if (this.suspendDepth > 0) { return; }

		await this.flushPositionChanges();

		const queued = this.pendingQueue.splice(0);
		if (queued.length === 0) { return; }

		const byFile = new Map<string, Hunk[]>();
		for (const hunk of queued) {
			const key = hunk.fsPath.toLowerCase();
			let arr = byFile.get(key);
			if (!arr) { arr = []; byFile.set(key, arr); }
			arr.push(hunk);
		}

		this._suppressGreenRefresh = true;

		const editorsToRefresh: vscode.TextEditor[] = [];
		const tasks = Array.from(byFile.entries()).map(async ([normPath, hunks]) => {
			let editor: vscode.TextEditor | undefined;
			for (const hunk of hunks) {
				if (this.hasZonesFor(hunk.id)) { continue; }
				if (this.droppedHunkIds.has(hunk.id)) { continue; }
				// Hunk may have been accepted/rejected while we were suspended.
				const live = this.store?.getHunk(hunk.id);
				if (!live || live.status !== 'pending') { continue; }
				if (!editor) {
					editor = vscode.window.visibleTextEditors.find(
						(e) => e.document.uri.fsPath.toLowerCase() === normPath,
					);
				}
				if (editor) {
					await this.createZonesForHunk(editor, hunk);
				}
			}
			if (editor) { editorsToRefresh.push(editor); }
		});

		await Promise.all(tasks);
		this._suppressGreenRefresh = false;

		for (const editor of editorsToRefresh) {
			this.refreshAllGreenDecorations(editor);
		}
	}

	// ==================== Reactive event handling ====================

	private handleStoreChange(event: DiffStoreEvent): void {
		switch (event.type) {
			case 'hunkAdded':
				this.onHunkAdded(event.hunk);
				break;
			case 'hunkUpdated':
				this.refreshZonesForHunk(event.hunk);
				break;
			case 'hunkRemoved':
				this.removeZonesForHunk(event.hunkId);
				break;
			case 'hunkPositionChanged':
				this.onHunkPositionChanged(event.hunkId, event.fsPath);
				break;
			case 'cleared':
				this.clearAll();
				break;
		}
	}

	private async onHunkAdded(hunk: Hunk): Promise<void> {
		// New live hunk replaces any stale dropped flag (rare: same ID is impossible
		// in practice — generateUuid — but the flag is queueMicrotask-cleaned anyway).
		this.droppedHunkIds.delete(hunk.id);

		if (this.suspendDepth > 0) {
			this.pendingQueue.push(hunk);
			return;
		}

		if (this.hasZonesFor(hunk.id)) { return; }

		const editor = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.fsPath.toLowerCase() === hunk.fsPath.toLowerCase(),
		);
		if (editor) {
			await this.createZonesForHunk(editor, hunk);
		}
	}

	private onHunkPositionChanged(hunkId: string, fsPath: string): void {
		this.pendingPositionChanges.set(hunkId, fsPath);
		if (this.suspendDepth > 0) { return; }
		if (!this.positionFlushScheduled) {
			this.positionFlushScheduled = true;
			queueMicrotask(() => this.flushPositionChanges());
		}
	}

	private async flushPositionChanges(): Promise<void> {
		this.positionFlushScheduled = false;
		const batch = new Map(this.pendingPositionChanges);
		this.pendingPositionChanges.clear();
		if (batch.size === 0) { return; }

		const byFile = new Map<string, string[]>();
		for (const [hunkId, fsPath] of batch) {
			if (!this.hasZonesFor(hunkId)) { continue; }
			const key = fsPath.toLowerCase();
			let arr = byFile.get(key);
			if (!arr) { arr = []; byFile.set(key, arr); }
			arr.push(hunkId);
		}

		for (const [normPath, hunkIds] of byFile) {
			this._suppressGreenRefresh = true;
			for (const hunkId of hunkIds) {
				this.removeZonesForHunk(hunkId);
			}
			this._suppressGreenRefresh = false;

			const editor = vscode.window.visibleTextEditors.find(
				(e) => e.document.uri.fsPath.toLowerCase() === normPath,
			);
			if (!editor) { continue; }

			this._suppressGreenRefresh = true;
			for (const hunkId of hunkIds) {
				const hunk = this.store?.getHunk(hunkId);
				if (hunk && hunk.status === 'pending') {
					await this.createZonesForHunk(editor, hunk);
				}
			}
			this._suppressGreenRefresh = false;
			this.refreshAllGreenDecorations(editor);
		}
	}

	/**
	 * Refresh zones for an updated hunk (merge scenario).
	 * Removes old zones + green decorations, then creates new ones
	 * with the hunk's updated content/positions.
	 */
	async refreshZonesForHunk(hunk: Hunk): Promise<void> {
		// Remove old visual state
		this.removeZonesForHunk(hunk.id);

		// Re-create for the updated hunk
		const editor = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.fsPath.toLowerCase() === hunk.fsPath.toLowerCase(),
		);
		if (editor) {
			await this.createZonesForHunk(editor, hunk);
		}
	}

	// ==================== Zone creation ====================

	async createZonesForHunk(editor: vscode.TextEditor, hunk: Hunk): Promise<void> {
		if (this.hasZonesFor(hunk.id)) { return; }
		if (this.droppedHunkIds.has(hunk.id)) { return; }

		const inFlight = this.inFlightCreation.get(hunk.id);
		if (inFlight) { return inFlight; }

		const promise = this.doCreateZonesForHunk(editor, hunk);
		this.inFlightCreation.set(hunk.id, promise);
		try {
			await promise;
		} finally {
			this.inFlightCreation.delete(hunk.id);
		}
	}

	private async doCreateZonesForHunk(editor: vscode.TextEditor, hunk: Hunk): Promise<void> {
		const hasRemoved = hunk.removedLines.length > 0;
		// Use currentEndLine - currentStartLine to check for added lines
		// (more reliable than addedLines.length after user merges)
		const addedLineCount = hunk.currentEndLine - hunk.currentStartLine;
		const hasAdded = addedLineCount > 0;
		const insetLine = InlineDiffRenderer.calculateInsetLine(hunk);
		const lineCount = editor.document.lineCount;

		// Runtime assertions — warn but don't throw to avoid breaking UX
		// insetLine is 0-based; -1 is valid (maps to afterLineNumber=0, before first line)
		if (insetLine < -1) {
			Logger.warn('[InlineDiffRenderer] ASSERT: insetLine < -1', { insetLine, hunk: hunk.id, currentStartLine: hunk.currentStartLine });
		}
		if (insetLine >= lineCount) {
			Logger.warn('[InlineDiffRenderer] ASSERT: insetLine >= lineCount', { insetLine, lineCount, hunk: hunk.id });
		}

		if (hasRemoved && hasAdded) {
			// REPLACEMENT: red zone + green decorations + buttons zone
			await this.createDeletionZone(editor, insetLine, hunk.removedLines, hunk.id, false);
			this.applyGreenDecorations(editor, hunk);
			const buttonsLine = InlineDiffRenderer.calculateButtonsLine(hunk);
			if (buttonsLine < insetLine) {
				Logger.warn('[InlineDiffRenderer] ASSERT: buttonsLine < insetLine', { buttonsLine, insetLine, hunk: hunk.id });
			}
			if (buttonsLine >= lineCount) {
				Logger.warn('[InlineDiffRenderer] ASSERT: buttonsLine >= lineCount (replacement)', { buttonsLine, lineCount, hunk: hunk.id });
			}
			await this.createButtonsZone(editor, buttonsLine, hunk.id);
		} else if (hasRemoved) {
			// DELETION: red zone + separate buttons zone (same style as replacement)
			await this.createDeletionZone(editor, insetLine, hunk.removedLines, hunk.id, false);
			const buttonsLine = insetLine; // buttons right after red zone (no added lines)
			await this.createButtonsZone(editor, buttonsLine, hunk.id);
		} else if (hasAdded) {
			// ADDITION: green decorations + buttons
			this.applyGreenDecorations(editor, hunk);
			const buttonsLine = InlineDiffRenderer.calculateButtonsLine(hunk);
			if (buttonsLine >= lineCount) {
				Logger.warn('[InlineDiffRenderer] ASSERT: buttonsLine >= lineCount (addition)', { buttonsLine, lineCount, hunk: hunk.id });
			}
			await this.createButtonsZone(editor, buttonsLine, hunk.id);
		}

		// If the hunk was dropped while we were awaiting (e.g. user clicked Accept All
		// mid-creation), tear the freshly-created zones down immediately.
		if (this.droppedHunkIds.has(hunk.id)) {
			this.removeZonesForHunk(hunk.id);
		}
	}

	// ==================== Green line decorations ====================

	/**
	 * Highlights added lines with green background decoration.
	 * currentStartLine is 1-indexed — the first added line in the editor.
	 */
	private applyGreenDecorations(editor: vscode.TextEditor, hunk: Hunk): void {
		// Use currentEndLine - currentStartLine for range size
		// (more reliable than addedLines.length after user merges)
		const lineCount = hunk.currentEndLine - hunk.currentStartLine;
		if (lineCount <= 0) { return; }

		const startLine0 = hunk.currentStartLine - 1; // 0-based
		const endLine0 = startLine0 + lineCount - 1;
		const range = new vscode.Range(startLine0, 0, endLine0, Number.MAX_SAFE_INTEGER);

		this.greenRanges.set(hunk.id, { fsPath: hunk.fsPath, ranges: [range] });
		if (!this._suppressGreenRefresh) {
			this.refreshAllGreenDecorations(editor);
		}
	}

	/**
	 * Removes green decorations for a specific hunk and refreshes the editor.
	 */
	private removeGreenDecorations(hunkId: string): void {
		const entry = this.greenRanges.get(hunkId);
		if (!entry) { return; }

		this.greenRanges.delete(hunkId);

		if (this._suppressGreenRefresh) { return; }

		const editor = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.fsPath.toLowerCase() === entry.fsPath.toLowerCase(),
		);
		if (editor) {
			this.refreshAllGreenDecorations(editor);
		}
	}

	/**
	 * Collects all green ranges for a given editor and applies them as a single decoration set.
	 */
	private refreshAllGreenDecorations(editor: vscode.TextEditor): void {
		const fsPath = editor.document.uri.fsPath.toLowerCase();
		const allRanges: vscode.Range[] = [];

		for (const entry of this.greenRanges.values()) {
			if (entry.fsPath.toLowerCase() === fsPath) {
				allRanges.push(...entry.ranges);
			}
		}

		editor.setDecorations(addedLineDecorationType, allRanges);
	}

	// ==================== Inset zone creation ====================

	async createDeletionZone(
		editor: vscode.TextEditor,
		lineNumber: number,
		removedLines: string[],
		hunkId: string,
		includeButtons: boolean,
	): Promise<void> {
		try {
			// Clamp lineNumber to valid range to prevent "Illegal value for lineNumber"
			const safeLineNumber = Math.max(-1, Math.min(lineNumber, editor.document.lineCount - 1));
			const height = includeButtons ? removedLines.length + 2 : removedLines.length;
			const inset = vscode.window.createWebviewTextEditorInset(editor, safeLineNumber, height, {
				enableScripts: true,
				localResourceRoots: [],
			});

			inset.webview.html = this.generateDeletionHtml(removedLines, hunkId, includeButtons);
			this.setupMessageHandling(inset);
			this.addInset(hunkId, {
				inset,
				hunkId,
				fsPath: editor.document.uri.fsPath,
				lineNumber,
				zoneType: 'deletion',
			});
			inset.onDidDispose(() => this.removeInsetFromArray(hunkId, inset));
		} catch (error) {
			Logger.error('[InlineDiffRenderer] Failed to create deletion zone:', error);
		}
	}

	async createButtonsZone(
		editor: vscode.TextEditor,
		lineNumber: number,
		hunkId: string,
	): Promise<void> {
		try {
			const safeLineNumber = Math.max(-1, Math.min(lineNumber, editor.document.lineCount - 1));
			const inset = vscode.window.createWebviewTextEditorInset(editor, safeLineNumber, 1, {
				enableScripts: true,
				localResourceRoots: [],
			});

			inset.webview.html = this.generateButtonsHtml(hunkId);
			this.setupMessageHandling(inset);
			this.addInset(hunkId, {
				inset,
				hunkId,
				fsPath: editor.document.uri.fsPath,
				lineNumber,
				zoneType: 'buttons',
			});
			inset.onDidDispose(() => this.removeInsetFromArray(hunkId, inset));
		} catch (error) {
			Logger.error('[InlineDiffRenderer] Failed to create buttons zone:', error);
		}
	}

	private setupMessageHandling(inset: vscode.WebviewEditorInset): void {
		inset.webview.onDidReceiveMessage(async (msg) => {
			if (msg.command === 'accept') {
				await vscode.commands.executeCommand('skycode.diff.accept', msg.pendingId);
			} else if (msg.command === 'reject') {
				await vscode.commands.executeCommand('skycode.diff.reject', msg.pendingId);
			} else if (msg.command === 'scroll') {
				const lines = Math.round(msg.deltaY / 18);
				if (lines !== 0) {
					await vscode.commands.executeCommand('editorScroll', {
						to: lines > 0 ? 'down' : 'up',
						by: 'line',
						value: Math.abs(lines),
					});
				}
			}
		});
	}

	// ==================== Zone management ====================

	removeZonesForHunk(hunkId: string): void {
		// Mark as dropped so any in-flight createZonesForHunk() tears its zones
		// down when it finishes (race-safe path).
		this.droppedHunkIds.add(hunkId);

		// Drop pending suspended/queued work for this hunk so flush() won't render it.
		this.dropFromPendingQueues(hunkId);

		const records = this.insets.get(hunkId);
		if (records) {
			for (const rec of records) {
				try { rec.inset.dispose(); } catch { /* already disposed */ }
			}
			this.insets.delete(hunkId);
		}
		this.removeGreenDecorations(hunkId);

		// Allow re-creation later (e.g. tab reopened after data restore).
		// Defer cleanup so racing creators see the dropped flag and bail out.
		// Skip cleanup while a creator is still in-flight — it will be reaped later.
		queueMicrotask(() => {
			if (!this.inFlightCreation.has(hunkId) && !this.insets.has(hunkId)) {
				this.droppedHunkIds.delete(hunkId);
			}
		});
	}

	private dropFromPendingQueues(hunkId: string): void {
		if (this.pendingQueue.length > 0) {
			for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
				if (this.pendingQueue[i].id === hunkId) {
					this.pendingQueue.splice(i, 1);
				}
			}
		}
		this.pendingPositionChanges.delete(hunkId);
	}

	hasZonesFor(hunkId: string): boolean {
		const records = this.insets.get(hunkId);
		return records !== undefined && records.length > 0;
	}

	clearForFile(fsPath: string): void {
		const norm = fsPath.toLowerCase();

		// Drop any queued hunks for this file so flush() won't render zombie zones
		// after a bulk accept/reject/preReject.
		if (this.pendingQueue.length > 0) {
			for (let i = this.pendingQueue.length - 1; i >= 0; i--) {
				const h = this.pendingQueue[i];
				if (h.fsPath.toLowerCase() === norm) {
					this.droppedHunkIds.add(h.id);
					this.pendingQueue.splice(i, 1);
				}
			}
		}
		for (const [hunkId, fp] of this.pendingPositionChanges) {
			if (fp.toLowerCase() === norm) {
				this.droppedHunkIds.add(hunkId);
				this.pendingPositionChanges.delete(hunkId);
			}
		}

		for (const [hunkId, records] of this.insets.entries()) {
			const matching = records.filter((r) => r.fsPath.toLowerCase() === norm);
			for (const r of matching) {
				this.droppedHunkIds.add(hunkId);
				try { r.inset.dispose(); } catch { /* already disposed */ }
			}
			const remaining = records.filter((r) => r.fsPath.toLowerCase() !== norm);
			if (remaining.length === 0) { this.insets.delete(hunkId); }
			else { this.insets.set(hunkId, remaining); }
		}
		// Clear green decorations for this file
		for (const [hunkId, entry] of this.greenRanges.entries()) {
			if (entry.fsPath.toLowerCase() === norm) {
				this.greenRanges.delete(hunkId);
			}
		}
		const editor = vscode.window.visibleTextEditors.find(
			(e) => e.document.uri.fsPath.toLowerCase() === norm,
		);
		if (editor) {
			editor.setDecorations(addedLineDecorationType, []);
		}

		// Release the dropped flags on the next microtask so any in-flight
		// createZonesForHunk() observes the flag and tears its zones down.
		queueMicrotask(() => {
			for (const id of [...this.droppedHunkIds]) {
				if (!this.insets.has(id) && !this.inFlightCreation.has(id)) {
					this.droppedHunkIds.delete(id);
				}
			}
		});
	}

	clearAll(): void {
		// Drop any suspended/queued state so flush() can't resurrect zones.
		for (const h of this.pendingQueue) { this.droppedHunkIds.add(h.id); }
		this.pendingQueue.length = 0;
		for (const id of this.pendingPositionChanges.keys()) { this.droppedHunkIds.add(id); }
		this.pendingPositionChanges.clear();

		for (const [hunkId, records] of this.insets) {
			this.droppedHunkIds.add(hunkId);
			for (const r of records) {
				try { r.inset.dispose(); } catch { /* already disposed */ }
			}
		}
		this.insets.clear();

		// Clear all green decorations
		this.greenRanges.clear();
		for (const editor of vscode.window.visibleTextEditors) {
			editor.setDecorations(addedLineDecorationType, []);
		}

		queueMicrotask(() => this.droppedHunkIds.clear());
	}

	private async restoreZonesForEditors(editors: readonly vscode.TextEditor[]): Promise<void> {
		if (!this.store) { return; }
		for (const editor of editors) {
			const fsPath = editor.document.uri.fsPath;
			const hunks = this.store.getPendingHunksByFile(fsPath);
			for (const hunk of hunks) {
				if (!this.hasZonesFor(hunk.id)) {
					await this.createZonesForHunk(editor, hunk);
				}
			}
		}
	}

	private cleanupClosedEditors(): void {
		const openPaths = new Set(
			vscode.window.visibleTextEditors.map((e) => e.document.uri.fsPath.toLowerCase()),
		);
		for (const [hunkId, records] of this.insets.entries()) {
			const toRemove = records.filter((r) => !openPaths.has(r.fsPath.toLowerCase()));
			for (const r of toRemove) {
				try { r.inset.dispose(); } catch { /* already disposed */ }
			}
			const remaining = records.filter((r) => openPaths.has(r.fsPath.toLowerCase()));
			if (remaining.length === 0) { this.insets.delete(hunkId); }
			else { this.insets.set(hunkId, remaining); }
		}
	}

	private addInset(hunkId: string, record: InsetRecord): void {
		const existing = this.insets.get(hunkId) || [];
		const deduped: InsetRecord[] = [];

		for (const old of existing) {
			if (old.zoneType === record.zoneType && old.fsPath.toLowerCase() === record.fsPath.toLowerCase()) {
				try { old.inset.dispose(); } catch { /* already disposed */ }
				continue;
			}
			deduped.push(old);
		}

		deduped.push(record);
		this.insets.set(hunkId, deduped);
	}

	private removeInsetFromArray(hunkId: string, inset: vscode.WebviewEditorInset): void {
		const records = this.insets.get(hunkId);
		if (records) {
			const filtered = records.filter((r) => r.inset !== inset);
			if (filtered.length === 0) { this.insets.delete(hunkId); }
			else { this.insets.set(hunkId, filtered); }
		}
	}

	// ==================== HTML generators ====================

	private esc(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}

	private generateDeletionHtml(
		removedLines: string[],
		hunkId: string,
		includeButtons: boolean,
	): string {
		const linesHtml = removedLines
			.map(
				(line) =>
					`<div class="line"><span class="code">${this.esc(line.replace(/\r$/, ''))}</span></div>`,
			)
			.join('\n');

		const btnHtml = includeButtons
			? `<div class="buttons">
			<button class="a" onclick="accept()">&#10003; ${t('diff.accept')}</button>
			<button class="r" onclick="reject()">&#10007; ${t('diff.reject')}</button>
		</div>`
			: '';

		const btnScript = includeButtons
			? `function accept(){vscode.postMessage({command:'accept',pendingId:'${hunkId}'});}
		function reject(){vscode.postMessage({command:'reject',pendingId:'${hunkId}'});}`
			: '';

		return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;font-family:'Consolas','Courier New',monospace;font-size:13px;line-height:18px;pointer-events:none}
.wrap{display:flex;flex-direction:column;width:100%;height:100%;background:rgba(100,30,30,.1);border-left:3px solid rgba(255,100,100,.5)}
.content{flex:1;overflow:hidden;padding:2px 0}
.line{white-space:pre;padding:0 8px;background:rgba(255,80,80,.15);color:#f88}
.code{white-space:pre}
.buttons{display:flex;gap:8px;padding:4px 8px;background:rgba(30,30,30,.5);border-top:1px solid rgba(100,100,100,.2);pointer-events:auto}
button{padding:3px 12px;font-size:11px;cursor:pointer;border:1px solid rgba(255,255,255,.07);border-radius:3px;background:rgba(60,60,60,.25);color:rgba(255,255,255,.45);transition:all .15s}
button:hover{background:rgba(80,80,80,.6);color:rgba(255,255,255,.9)}
.a{border-color:rgba(80,200,80,.15);color:rgba(120,255,120,.45)}.a:hover{background:rgba(60,120,60,.5);color:rgba(120,255,120,.9)}
.r{border-color:rgba(200,80,80,.15);color:rgba(255,120,120,.45)}.r:hover{background:rgba(120,60,60,.5);color:rgba(255,120,120,.9)}
</style></head><body><div class="wrap"><div class="content">${linesHtml}</div>${btnHtml}</div>
<script>const vscode=acquireVsCodeApi();${btnScript}
let _lt=0;document.addEventListener('wheel',e=>{const n=Date.now();if(n-_lt<32){e.preventDefault();return;}_lt=n;vscode.postMessage({command:'scroll',deltaY:e.deltaY,deltaX:e.deltaX});e.preventDefault();},{passive:false});
</script></body></html>`;
	}

	private generateButtonsHtml(hunkId: string): string {
		return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;pointer-events:none}
.wrap{display:flex;align-items:flex-start;width:100%;height:100%;padding:1px 8px 0 11px}
.buttons{display:flex;gap:6px;pointer-events:auto}
button{padding:1px 10px;font-size:11px;line-height:14px;cursor:pointer;border:1px solid rgba(255,255,255,.07);border-radius:3px;background:rgba(60,60,60,.25);color:rgba(255,255,255,.45);transition:all .15s}
button:hover{background:rgba(80,80,80,.6);color:rgba(255,255,255,.9)}
.a{border-color:rgba(80,200,80,.15);color:rgba(120,255,120,.45)}.a:hover{background:rgba(60,120,60,.5);color:rgba(120,255,120,.9)}
.r{border-color:rgba(200,80,80,.15);color:rgba(255,120,120,.45)}.r:hover{background:rgba(120,60,60,.5);color:rgba(255,120,120,.9)}
</style></head><body><div class="wrap"><div class="buttons">
<button class="a" onclick="accept()">&#10003; ${t('diff.accept')}</button>
<button class="r" onclick="reject()">&#10007; ${t('diff.reject')}</button>
</div></div>
<script>const vscode=acquireVsCodeApi();
function accept(){vscode.postMessage({command:'accept',pendingId:'${hunkId}'});}
function reject(){vscode.postMessage({command:'reject',pendingId:'${hunkId}'});}
let _lt=0;document.addEventListener('wheel',e=>{const n=Date.now();if(n-_lt<32){e.preventDefault();return;}_lt=n;vscode.postMessage({command:'scroll',deltaY:e.deltaY,deltaX:e.deltaX});e.preventDefault();},{passive:false});
</script></body></html>`;
	}

	// ==================== Dispose ====================

	dispose(): void {
		this.clearAll();
		for (const d of this.disposables) { d.dispose(); }
		this.disposables.length = 0;
	}
}
