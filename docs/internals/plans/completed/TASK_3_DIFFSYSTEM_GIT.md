# Task 3: DiffSystem ↔ Git [ВЫПОЛНЕНО]

## Статус: ВЫПОЛНЕНО (3-уровневая защита в `DiffSystem.ts`)

## Цель

Diff-сессия автоматически закрывается, если базовый снапшот разошёлся с диском/git.

## Реализовано

**Уровень 1 — hard guard на запись:**
- `recordWrittenHash()` + `checkFileStale()` — sha256 сверка перед apply/accept/revert.

**Уровень 2 — событийные хуки:**
- `onDidChangeTextDocument`, `onDidSaveTextDocument`, `FileSystemWatcher` на файлы сессий.
- `setupGitWatcher()` через `vscode.git` API → `repo.state.onDidChange`.
- Дебаунс 150 мс.

**Уровень 3 — periodic poll:**
- `setInterval(pollActiveFiles, 8_000)`.

**Защита от своих записей:**
- `SystemEditGuard.isSystemEdit()` + `lastWrittenHash`.

## Файлы

- `src/core/diff-v2/DiffSystem.ts` (git-логика встроена, отдельный `GitWatcher.ts` не создавался)
- `src/core/diff-v2/engine/SystemEditGuard.ts`
- `src/core/diff-v2/storage/FileSnapshotStorage.ts`
- `src/core/diff-v2/storage/DiffStore.ts`
- `src/core/diff-v2/engine/HunkApplier.ts`

## Acceptance

1. `git commit` файла с открытым diff → сессия закрывается.
2. Внешняя правка файла → сессия закрывается.
3. `git checkout` → все diff-сессии закрываются.
4. Accept/Reject не пишет в файл при hash mismatch.
