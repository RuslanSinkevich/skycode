> **Русская версия:** [fork-patches.md](../ru/development/fork-patches.md)

# VS Code Fork Patches

Core modifications are marked with a `SKYCODE_FORK_BEGIN` / `SKYCODE_FORK_END` pair around a block, or a single `SKYCODE:` / `[SKYCODE]` comment for a one-liner. Grep for the bare word: a `SKYCODE_FORK` pattern misses the one-line markers, which is how two patches went undocumented until the 1.123.2 merge.

To find all patches: `git grep SKYCODE -- src/ build/`

As of the 1.123.2 merge there are **36 markers across 11 files** (`product.json`, item 1
below, carries no markers). That count is the cheapest post-merge check there is — see
[Post-Merge Checklist](#post-merge-checklist).

## Modified Core Files

### 1. `product.json` — Branding & Configuration
- `nameShort` / `nameLong` → "Skycode"
- `applicationName` → "skycode", `dataFolderName` → ".skycode"
- `extensionAllowedProposedApi` → `["skycode.skycode"]` (for editorInsets)

`defaultChatAgent` is **left at upstream's value** (`GitHub.copilot`). Copilot is not
disabled at the product level.

### 2. `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`
Renames the auxiliary bar container to "Skycode" so the Skycode webview has a branded
home. **The Copilot Chat view stays registered** — the fork deliberately does not fight
upstream here, because this file changes on almost every release and removing the view
descriptor produced a conflict every single merge.

**Merge risk: low** — one title string.

### 3. `src/main.ts` — Default Locale
Default locale set to `ru`, with auto-patching of `argv.json` on first launch.

### 4. `src/vs/base/node/nls.ts` — Language Pack Bootstrap
Auto-generates `languagepacks.json` from the built-in language pack on first launch.
Eliminates the "first launch in English, needs restart" problem.

### 5. `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
Added fallback in `getViewContainer()` to resolve core containers by direct ID. Without
this, extensions can't register views in core containers like `workbench.panel.chat`.

### 6. `src/vs/workbench/api/common/extHostCodeInsets.ts`
Keeps `line + 1` when calling `$createEditorInset`. The extension API is 0-based while
mainThread expects a 1-based `afterLineNumber`, and the `InlineDiffRenderer` formulas
(`calculateInsetLine` / `calculateButtonsLine`) are written against that convention.

Removing the `+1` renders diff Accept/Reject buttons one line off. An earlier revision of
this document told you to remove it — that was wrong and has been corrected.

### 7. `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts`
Disabled the Copilot Code Actions Provider (Fix, Explain, Generate from error hovers).
Skycode ships its own AI code actions through the Quick Fix menu.

### 8. `src/vs/editor/contrib/hover/browser/markerHoverParticipant.ts`
Removed the "✨ Fix (Ctrl+I)" button from error hovers, for the same reason as #7.

### 9. `src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts`
`verify()` always returns `Success`. OSS builds have no Microsoft signing key, so real
verification always fails and `extensionManagementService.downloadExtension()` refuses to
install anything when `verificationStatus !== Success`.

### 10. `build/filters.ts`
Excluded `extensions/skycode/**` from upstream copyright header checks.

### 11. `build/hygiene.ts`
Allowed Unicode in comments (Cyrillic) by stripping comments before the Unicode check.

### 12. `build/gulpfile.vscode.ts` — Windows Packaging
Two patches inside `patchWin32DependenciesTask`:

- `isPEFile()` guard — skips files that are not PE binaries, which `rcedit` cannot patch.
- A missing `signtool.exe` resolves to "unsigned" instead of rejecting. Upstream added
  `stripAuthenticodeSignature()`, which shells out to `signtool.exe`; that binary ships
  with the Windows SDK and only CI puts it on `PATH`, so upstream's version fails a local
  `vscode-win32-x64` build at the very last step.

## Added Extensions

### `extensions/vscode-language-pack-ru/`
Built-in Russian language pack. Activated automatically via
`bootstrapBuiltInLanguagePack()` in `nls.ts`. Works from first launch without restart.

## Updating Upstream

```bash
git fetch upstream --tags

# Git LFS: extensions/copilot tracks *.sqlite test fixtures, and some blobs are
# missing from the LFS server (404). They are simulation-test data, not needed to
# build. Make the skip permanent for this clone — each terminal is a fresh shell,
# so an env var would have to be repeated on every command:
git config --local filter.lfs.smudge "git-lfs smudge --skip -- %f"
git config --local filter.lfs.process "git-lfs filter-process --skip"

# Preview the conflicts without touching the working tree:
git merge-tree --write-tree --name-only HEAD <tag>

git merge <tag>
```

Resolving conflicts, in order of what actually saves time:

1. **Check whether upstream already did it.** Most fork patches get upstreamed or made
   obsolete by a refactor. In the 1.123.2 merge, 20 of 22 conflicts resolved to plain
   "take upstream" because the fork's intent was already there. Compare each side against
   the merge base (`git diff $(git merge-base HEAD <tag>) HEAD -- <file>`) before hand-merging.
2. **Look for our markers:** `git grep SKYCODE -- src/ build/`.
3. Regenerate lockfiles and notices rather than merging them line by line.

## Post-Merge Checklist

- [ ] `git grep -c SKYCODE -- src/ build/` — marker count matches the number above;
      a drop means a patch was lost to auto-merge
- [ ] `product.json` — name is "Skycode", `extensionAllowedProposedApi` includes `skycode.skycode`
- [ ] `main.ts` — locale defaults and argv.json patch intact
- [ ] `nls.ts` — `bootstrapBuiltInLanguagePack()` present
- [ ] `viewsExtensionPoint.ts` — `getViewContainer` fallback present
- [ ] `extHostCodeInsets.ts` — `line + 1` still present
- [ ] `npm run compile` — 0 errors
- [ ] `.\scripts\code.bat` — app starts, UI is in Russian on first launch, Skycode panel opens,
      diff Accept/Reject buttons sit on the right line
- [ ] `npm run gulp vscode-win32-x64` — see [getting-started.md](./getting-started.md) for the
      required `VCToolsVersion` pin
