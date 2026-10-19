# Skycode AI — Diff System v4

## Обзор

Cursor-like diff система. AI вносит изменения напрямую в файлы. В редакторе они подсвечиваются стандартными декорациями VS Code; принять или отклонить можно в панели Pending Changes в чате и командами `skycode.diff.*`. Разбор по кускам — в стандартном окне сравнения «до агента ↔ сейчас». Per-message snapshots обеспечивают точный откат.

Расширение работает в обычном VS Code, поэтому закрытые (proposed) API, в том числе `editorInsets`, не используются: View Zones и кнопок Accept/Reject прямо в тексте редактора нет.

---

## Архитектура v4

```
DiffSystem (facade) — src/core/diff-v2/DiffSystem.ts
├── Storage
│   ├── DiffStore (единое хранилище: ResponseGroups, FileChanges, Hunks)
│   ├── FileSnapshotStorage (per-message снапшоты для отката)
│   └── PendingChangesStorage (bridge → webview PendingChangesBar)
├── Engine
│   ├── HunkApplier (применение изменений, создание Hunk записей)
│   ├── HunkReverter (accept/reject, откат файлов)
│   ├── PositionTracker (пересчёт позиций после правок/reject)
│   └── SystemEditGuard (отличает системные записи от ручных)
└── UI
    ├── HunkDecorations (зелёный фон добавленного, красная черта на месте удаления, hover «что было до агента»)
    └── KeyboardNavigation (кросс-файловая навигация по диффам)
```

---

## Что нового в v4 (vs v3)

| Фича | v3 | v4 |
|---|---|---|
| Снапшоты | Нет | Per-message: каждое сообщение = свой снапшот |
| Rollback | Hunk-by-hunk | Snapshot-based + per-group hunk filtering |
| Per-message rollback | Нет | Да: удаление msg2 не трогает msg1 |
| Overlap detection | Strict (`<`/`>`) | Inclusive (`<=`/`>=`), adjacent тоже |
| removedLines | Из diff computation | Из реального файла (MISMATCH protection) |
| HunkReverter EOL | `\r\n` на Windows | Всегда `\n` (VS Code нормализует) |
| No-op detection | Нет | Да: модель получает ошибку если файл не изменился |
| Навигация | Только в файле | Кросс-файловая (`Alt+]` / `Alt+[` переходят между файлами) |
| Chat preview | Только для write_to_file | Для всех tool types (fallback из hunk data) |
| ApprovalGate | pWaitFor polling | Promise-based + early response queue |
| Orphaned RGs | Накапливаются | Cleanup при старте |

---

## Поток данных

```
User message → say("text") → startCheckpoint(messageTs)
                                    ↓
                            ResponseGroup created
                            (snapshot saved before first edit)
                                    ↓
AI Tool (write_to_file / replace_text / delete_block)
  → DiffSystem.replaceLines() / deleteLines() / addLines()
    → preSaveAndSnapshot() — idempotent per RG
    → applyWithOverlapCheck() — auto-reject adjacent/overlapping hunks
    → HunkApplier.applyReplacement() — writes file + creates Hunk
      → removedLines = actual file content (not diff computation)
      → DiffStore.createHunk() — fires hunkAdded event
        → HunkDecorations (пересчитывает декорации в редакторах)
        → PendingChangesStorage (синхронизация → webview)

User feedback → startCheckpoint(feedbackTs) — NEW RG + snapshot
  → AI processes feedback → edits go into new RG
```

---

## Per-message Rollback

```
Message 1 → RG1 (snapshot A) → hunks 1, 2, 3
Message 2 → RG2 (snapshot B) → hunks 4, 5
Message 3 → RG3 (snapshot C) → hunk 6

Delete message 2:
  → rollbackFromMessage(ts2)
  → finds RG2, RG3 (chatMessageTs >= ts2)
  → restores file from snapshot B
  → marks only RG2+RG3 hunks as rejected
  → RG1 hunks remain pending ✓
```

Checkpoints создаются в двух местах:
- `Task.startTask()` — первое сообщение
- `AttemptCompletionHandler` + `Task.resumeTaskFromHistory()` — follow-up сообщения

---

## Отображение в редакторе

Только стандартные декорации VS Code (`HunkDecorations`), без вставок в текст:

- **Добавленные и изменённые строки** — зелёный фон (`diffEditor.insertedLineBackground`) и метка на полосе прокрутки.
- **Место удаления** — красная черта над следующей строкой (под последней, если удалено в конце файла) и метка на полосе прокрутки.
- **Hover** — что было до агента (до 20 строк) и ссылка «открыть сравнение».
- **Окно сравнения** — команда `skycode.diff.openBaselineDiff` открывает стандартный diff «до агента ↔ сейчас» (схема `skycode-base`), в нём у каждого куска есть стрелка отката.
- **Принять/отклонить** — панель Pending Changes в чате (`PendingChangesBar`) и команды ниже.

Декорации не хранят состояния: при любом изменении хранилища или набора видимых редакторов они пересчитываются из ожидающих hunks.

---

## Accept / Reject

### Accept
1. Файл не трогается (новый код уже на месте)
2. `store.updateHunkStatus('accepted')` → fires `hunkRemoved`
3. `HunkDecorations` пересчитывает декорации (подсветка снимается)
4. Snapshot cleanup если 0 pending hunks

### Reject
1. `HunkReverter.reject()` — `cleanLines = removedLines.map(l => l.replace(/\r$/, ''))`
2. `applyEdit(uri, range, cleanLines.join('\n') + '\n')` — всегда `\n`
3. `PositionTracker.recalculate()` сдвигает оставшиеся хунки
4. `store.updateHunkStatus('rejected')` → fires `hunkRemoved`
5. Parent status cascade: all rejected → RG='rejected', mixed → RG='partial'

---

## Overlap Detection

При применении нового hunk'а, `applyWithOverlapCheck` ищет пересекающиеся или смежные pending hunks:

```typescript
const overlapping = pendingHunks.filter(h =>
  h.currentStartLine <= endLine && h.currentEndLine >= startLine
);
```

Overlapping/adjacent hunks auto-reject'ятся bottom-to-top перед применением нового.

---

## No-op Detection

Если после DiffSystem операций файл не изменился (overlap auto-reject + re-apply = same content):
- Модель получает `toolError("No changes were made to the file")`
- `consecutiveMistakeCount++`
- Карточка "Изменён" НЕ создаётся

---

## Защита данных

### removedLines — из реального файла
`HunkApplier.applyReplacement` читает `actualRemovedLines = lines.slice(startIdx, ...)` из файла, а не доверяет caller'у. Это гарантирует что красная зона показывает реальный оригинал.

### SystemEditGuard
Защищает от ложных `onDidChangeTextDocument`:
- `withSystemEdit(fn)` — Set-based tokens, thread-safe
- Nested calls корректно отслеживаются

### ApprovalGate — early response queue
Решает race condition: если webview отправляет ответ ДО того как Task дошёл до `ask()`, ответ ставится в очередь и доставляется при вызове `waitForResponse()`.

---

## Тесты

Юнит-тесты (mocha) лежат рядом с кодом в `__tests__/`: `src/core/diff-v2/__tests__/`, `engine/__tests__/`, `storage/__tests__/`, `ui/__tests__/`, а также `src/core/session/__tests__/ApprovalGate.test.ts` и `src/core/task/tools/handlers/__tests__/WriteToFileToolHandler.test.ts`.

Запуск (из `extensions/skycode`): `npm run test:unit`.

---

## Команды

| Команда | Описание |
|---------|----------|
| `skycode.diff.accept` | Принять одно изменение |
| `skycode.diff.reject` | Отклонить одно изменение |
| `skycode.diff.acceptAllInFile` | Принять все в текущем файле |
| `skycode.diff.rejectAllInFile` | Отклонить все в текущем файле |
| `skycode.diff.nextHunk` / `skycode.diff.prevHunk` | Следующий / предыдущий hunk (кросс-файловый), `Alt+]` / `Alt+[` |
| `skycode.diff.acceptCurrent` / `skycode.diff.rejectCurrent` | Принять / отклонить текущий hunk, `Ctrl+Shift+Y` / `Ctrl+Shift+N` |
| `skycode.diff.openBaselineDiff` | Окно сравнения «до агента ↔ сейчас» для файла |
| `skycode.diff.clearAll` | Очистить все pending changes |
