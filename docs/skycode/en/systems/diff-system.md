> **Русская версия:** [diff-system.md](../../systems/diff-system.md)

# Change Review

The agent writes its edits straight into files. Each edit stays pending until you accept or reject it. A snapshot of the files is kept for every user message, so changes can be rolled back. Code: `extensions/skycode/src/core/diff-v2/`. The chat bar: `webview-ui/src/components/chat/pending-changes/PendingChangesBar.tsx`.

## What the user sees

### In the editor

Highlighting is drawn with standard VS Code decorations (`ui/HunkDecorations.ts`). There are no custom buttons or inserted widgets in the editor.

- **Added and changed lines:** a green background across the whole line (the theme color `diffEditor.insertedLineBackground`) and a mark on the scrollbar.
- **Place of deletion:** a thin red line above the next line (below the last line when the deletion is at the end of the file) and a mark on the scrollbar. The deleted lines themselves are not shown in the editor.
- **On hover** over a highlighted place you see the removed text ("Before the agent (N lines)", up to 20 lines) and an "Open comparison" link.
- **There are no Accept or Reject buttons in the editor.**

If the "before agent ↔ now" diff editor is open for a file, the custom highlighting is switched off there, so it does not duplicate the highlighting VS Code draws.

### Keybindings and commands

The keybindings work when the editor has pending changes.

| Action | Windows and Linux | macOS | Command |
|---|---|---|---|
| Accept the change under the cursor | `Ctrl+Shift+Y` | `Cmd+Shift+Y` | `skycode.diff.acceptCurrent` |
| Reject the change under the cursor | `Ctrl+Shift+N` | `Cmd+Shift+N` | `skycode.diff.rejectCurrent` |
| Next change | `Alt+]` | `Alt+]` | `skycode.diff.nextHunk` |
| Previous change | `Alt+[` | `Alt+[` | `skycode.diff.prevHunk` |

Navigation goes through files in alphabetical order: when the current file has no more changes, the next file with changes is opened.

Command Palette only:

| Command | What it does |
|---|---|
| `skycode.diff.acceptAllInFile` | Accept all changes in the current file |
| `skycode.diff.rejectAllInFile` | Reject all changes in the current file |
| `skycode.diff.openBaselineDiff` | Open the diff editor for a file |
| `skycode.diff.clearAll` | Forget all pending changes. Files are not modified |

### In the chat

A pending changes bar sits above the input:

- a summary "N files +X −Y";
- arrows to the previous and next change;
- "Reject" («Отменить»): reject all changes (with a "Reject all changes?" confirmation);
- "Accept" («Принять»): accept all changes.

Clicking the summary expands the file list. Hovering a file shows accept and reject buttons for that file. Clicking the file name opens the diff editor.

### The diff editor

The standard VS Code diff editor titled "file name (before agent ↔ now)". The left side is the baseline state of the file (before the agent's edits, or before the last accepted change), the right side is the current file. The built-in revert arrows for each block work there. For a new file (it did not exist before the agent) the diff editor is not opened; the file itself opens with highlighting. For a file the agent deleted, only the left side is opened.

## Rollback per message

Before the first edit of a file within a user message, a snapshot of its content is saved. All edits of one message form a group (`ResponseGroup`). When you delete a message in the chat or retry it, `DiffSystem.rollbackFromMessage()` finds the groups of that message and later ones, restores files from the snapshots, and marks their changes as rejected. Groups of earlier messages stay untouched.

## Structure

```
DiffSystem — core/diff-v2/DiffSystem.ts (facade)
├── storage/
│   ├── DiffStore               groups, file change records, hunks (workspaceState)
│   ├── FileSnapshotStorage     file snapshots on disk
│   └── PendingChangesStorage   bridge to the chat bar
├── engine/
│   ├── HunkApplier             writes an edit to the file, creates a hunk
│   ├── HunkReverter            accept and reject
│   ├── PositionTracker         recomputes line numbers after edits
│   └── SystemEditGuard         tells system writes apart from manual edits
└── ui/
    ├── HunkDecorations         highlighting in the editor
    └── KeyboardNavigation      navigation and accept/reject commands
```

The write tools (`write_to_file`, `replace_in_file`, `replace_text`, `delete_block`, `apply_patch`) call `replaceLines`, `deleteLines` and `addLines`. Then:

1. If the file is open with unsaved edits, it is saved. If there is no snapshot of the file for this group yet, one is created.
2. `applyWithOverlapCheck`: if the new edit overlaps or touches a pending hunk in the same place, the old hunk is rejected first (bottom to top), then the new edit is applied. If the model rewrites the same place more than 5 times in a row, the edit is blocked with an error.
3. `HunkApplier` writes the edit and takes the removed lines from the actual file content, not from what the caller passed.
4. The store reports the change, and the decorations and the chat bar redraw.

**Accept** does not change the file (the new text is already there): the hunk is marked accepted, and the baseline of the file for the diff editor moves up to the accepted state. When a file has no pending hunks left, its snapshot is deleted. **Reject** restores the original lines of the hunk and shifts the line numbers of the remaining hunks. The group status is derived from the hunk statuses: all rejected, partly rejected, or pending.

## Manual edits and git

- If you edit text inside a pending hunk, its boundaries are updated (`handleManualEdit`).
- After a commit or a HEAD change in git, pending changes are checked against the file. If the file in git matches what the agent wrote, the changes are accepted automatically (a notification says they were confirmed because they were committed). If git rewrote the file, the hunk is closed without touching the file. If there is no data to compare, the changes stay pending.

## Environment

Only the standard VS Code API is needed (`createTextEditorDecorationType`, `TextDocumentContentProvider`, `vscode.diff`). Proposed APIs are not used.

## Tests

Tests are in `core/diff-v2/__tests__/` and `core/diff-v2/*/__tests__/`. Run them with `npm run test:unit` from `extensions/skycode`.
