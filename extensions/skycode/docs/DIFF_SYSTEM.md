# Skycode AI — система diff

## Обзор

Агент пишет изменения прямо в файлы. Каждое изменение запоминается как hunk (кусок) с исходным текстом. В редакторе правки подсвечены стандартными декорациями VS Code. Принять или отменить их можно в панели изменений в чате, командами `skycode.diff.*` и горячими клавишами. Подробный разбор по кускам — в стандартном окне сравнения «до агента ↔ сейчас». Снимки файлов по сообщениям (per-message snapshots) нужны для отката.

Расширение работает в обычном VS Code, поэтому закрытые (proposed) API, в том числе `editorInsets`, не используются: View Zones и кнопок Accept/Reject прямо в тексте редактора нет.

---

## Архитектура

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

Checkpoint (`DiffSystem.startCheckpoint`) создаётся для сообщения пользователя: в `Task.startTask()` (первое сообщение), в `Task.resumeTaskFromHistory()` и при ответе пользователя в задаче, а также в `AttemptCompletionHandler` (ответ после завершения задачи). Ключ группы — id задачи, поэтому правки параллельных вкладок не смешиваются.

---

## Отображение в редакторе

Только стандартные декорации VS Code (`HunkDecorations`), без вставок в текст:

- **Добавленные и изменённые строки** — зелёный фон (`diffEditor.insertedLineBackground`) и метка на полосе прокрутки.
- **Место удаления** — красная черта над следующей строкой (под последней, если удалено в конце файла) и метка на полосе прокрутки.
- **Hover** — что было до агента (до 20 строк) и ссылка «открыть сравнение».
- **Окно сравнения** — команда `skycode.diff.openBaselineDiff` открывает стандартный diff «до агента ↔ сейчас» (схема `skycode-base`), в нём у каждого куска есть стрелка отката.
- **Кнопок «Принять»/«Отклонить» в тексте редактора нет.** Принять или отклонить можно в панели изменений в чате (`PendingChangesBar`), командами ниже и горячими клавишами.

---

## Панель изменений в чате

`webview-ui/src/components/chat/pending-changes/PendingChangesBar.tsx`. Показывается, пока есть непринятые правки.

- Заголовок: «N файлов +X −Y» (число файлов, добавленные и удалённые строки). Клик разворачивает список файлов.
- Стрелки влево и вправо переходят к предыдущему и следующему куску (`navigatePrevHunk` / `navigateNextHunk`).
- «Отменить» отклоняет все правки после подтверждения («Отклонить все изменения?»), «Принять» принимает все.
- В списке у каждого файла свои кнопки принять и отклонить. Клик по файлу открывает окно сравнения «до агента ↔ сейчас» (`openPendingChangesDiff`), а если сравнивать не с чем, сам файл.

## Горячие клавиши

| Клавиши | Команда |
|---|---|
| `Ctrl+Shift+Y` (macOS `Cmd+Shift+Y`) | `skycode.diff.acceptCurrent`, принять кусок под курсором |
| `Ctrl+Shift+N` (macOS `Cmd+Shift+N`) | `skycode.diff.rejectCurrent`, отклонить кусок под курсором |
| `Alt+]` / `Alt+[` | `skycode.diff.nextHunk` / `skycode.diff.prevHunk`, следующий и предыдущий кусок, в том числе в другом файле |

Клавиши работают в фокусе редактора, пока есть непринятые правки (контекст `skycode.hasPendingHunks`).

Декорации не хранят состояния: при любом изменении хранилища или набора видимых редакторов они пересчитываются из ожидающих hunks.

---

## Accept / Reject

### Accept
1. Файл не трогается (новый код уже на месте)
2. `store.updateHunkStatus('accepted')` → fires `hunkRemoved`
3. `HunkDecorations` пересчитывает декорации (подсветка снимается)
4. Snapshot cleanup если 0 pending hunks

### Reject
0. Перед правкой `verifyHunkContent` сверяет текст в файле с ожидаемым. Если позиции «уехали» (файл правили вручную), файл целиком восстанавливается из снапшота, а все ожидающие куски файла помечаются отклонёнными.
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

Overlapping/adjacent hunks auto-reject'ятся bottom-to-top перед применением нового. Если подряд больше 5 таких циклов на одном файле (`MAX_OVERLAP_CYCLES`), правка блокируется с ошибкой «Loop detected»: модель, которая переписывает одно и то же место, останавливается.

---

## No-op Detection

Если после DiffSystem операций файл не изменился (overlap auto-reject + re-apply = same content):
- Модель получает `toolError("No changes were made to the file")`
- `consecutiveMistakeCount++`
- Карточка "Изменён" НЕ создаётся

---

## Защита данных

### removedLines — из реального файла
`HunkApplier.applyReplacement` читает `actualRemovedLines = lines.slice(startIdx, ...)` из файла, а не доверяет caller'у. Так в hover и при отклонении используется реальный оригинал. Если первая строка не совпала с ожидаемой, в лог пишется `removedLines MISMATCH`.

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
