> **English version:** [fork-patches.md](../../development/fork-patches.md)

# Патчи форка VS Code

Правки ядра помечены парой `SKYCODE_FORK_BEGIN` / `SKYCODE_FORK_END` вокруг блока либо одиночным комментарием `SKYCODE:` / `[SKYCODE]` для однострочной правки. Ищи по голому слову: шаблон `SKYCODE_FORK` пропускает однострочные маркеры — именно из-за этого два патча оставались недокументированными до мержа 1.123.2.

Найти все патчи: `git grep SKYCODE -- src/ build/`

На момент мержа 1.136.1 это **39 маркеров в 13 файлах** (`product.json`, пункт 1 ниже,
маркеров не содержит). Пересчёт маркеров — самая дешёвая проверка после мержа, см.
[Чеклист после мержа](#чеклист-после-мержа).

## Изменённые файлы ядра

### 1. `product.json` — брендинг и конфигурация

- `nameShort` / `nameLong` → "Skycode"
- `applicationName` → "skycode", `dataFolderName` → ".skycode"
- `extensionAllowedProposedApi` → `["skycode.skycode"]` (для editorInsets)

`defaultChatAgent` **оставлен как в upstream** (`GitHub.copilot`). На уровне продукта
Copilot не отключается.

### 2. `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`

Контейнер в AuxiliaryBar переименован в "Skycode", чтобы у webview Skycode было
брендированное место. **Представление Copilot Chat остаётся зарегистрированным** — форк
сознательно не воюет здесь с upstream: файл меняется почти в каждом релизе, и удаление
дескриптора представления давало конфликт при каждом мерже.

**Риск при мерже: низкий** — одна строка заголовка.

### 3. `src/main.ts` — локаль по умолчанию

Локаль по умолчанию — `ru`, с автопатчем `argv.json` при первом запуске.

### 4. `src/vs/base/node/nls.ts` — загрузка language pack

Автоматически генерирует `languagepacks.json` из встроенного language pack при первом
запуске. Убирает проблему «первый запуск на английском, нужен перезапуск».

### 5. `src/vs/workbench/api/browser/viewsExtensionPoint.ts`

В `getViewContainer()` добавлен fallback: разрешение core-контейнеров по прямому ID. Без
этого расширения не могут регистрировать представления в core-контейнерах вроде
`workbench.panel.chat`.

### 6. `src/vs/workbench/api/common/extHostCodeInsets.ts`

При вызове `$createEditorInset` сохраняется `line + 1`. API расширений использует
нумерацию с нуля, а mainThread ожидает `afterLineNumber` с единицы, и формулы
`InlineDiffRenderer` (`calculateInsetLine` / `calculateButtonsLine`) написаны под эту
конвенцию.

Если убрать `+1`, кнопки Accept/Reject в diff съезжают на строку. Прошлая редакция этого
документа предписывала убрать `+1` — это было неверно и здесь исправлено.

### 6b. `src/vs/workbench/api/browser/mainThreadCodeInsets.ts`

Сознательно не задаёт `afterColumn` у view zone. Upstream ставит туда 1, из-за чего зона
получает ordinal 1 (`ordinal ?? afterColumn ?? 10000` в viewZones); без него inset
остаётся ниже других зон на той же строке. Парный к п. 6 — вдвоём они и дают правильное
положение кнопок Accept/Reject в diff.

Патч существовал без маркера с самого первого коммита форка и обнаружился только при
мерже 1.136.1, когда я разбирал то, что выглядело как потеря автомержа. Теперь помечен.

### 7. `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts`

Отключён Copilot Code Actions Provider (Fix, Explain, Generate из ховеров ошибок).
Skycode предоставляет свои AI-действия через меню Quick Fix.

### 8. `src/vs/editor/contrib/hover/browser/markerHoverParticipant.ts`

Убрана кнопка "✨ Fix (Ctrl+I)" из ховеров ошибок — по той же причине, что и в п. 7.

### 9. `src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts`

`verify()` всегда возвращает `Success`. У OSS-сборок нет ключа подписи Microsoft, поэтому
настоящая проверка всегда падает, а `extensionManagementService.downloadExtension()`
отказывается ставить расширение при `verificationStatus !== Success`.

### 10. `build/filters.ts`

Исключён `extensions/skycode/**` из проверок upstream copyright header.

### 11. `build/hygiene.ts`

Разрешён Unicode в комментариях (кириллица): комментарии вырезаются перед проверкой Unicode.

### 12. `build/gulpfile.vscode.ts` — упаковка под Windows

Два патча внутри `patchWin32DependenciesTask`:

- Guard `isPEFile()` — пропускает файлы, не являющиеся PE-бинарниками: `rcedit` их не умеет.
- Отсутствующий `signtool.exe` трактуется как «подписи нет», а не как ошибка. Upstream
  добавил `stripAuthenticodeSignature()`, который зовёт `signtool.exe`; этот бинарник
  входит в Windows SDK и попадает в `PATH` только на CI, поэтому upstream-версия роняет
  локальную сборку `vscode-win32-x64` на самом последнем шаге.

### 13. `.eslint-allowed-javascript-files`

Upstream 1.136.1 добавил правило `code-no-new-javascript-files`, которое hygiene проверяет
по всем отслеживаемым `.js`/`.cjs`/`.mjs`. Собственное расширение форка
`extensions/skycode` содержит 46 таких файлов (скрипты сборки, тестовая обвязка,
вендоренный `@xenova/transformers`) — они перечислены помеченным блоком в конце файла.
Список сверяется точным совпадением, без glob'ов, поэтому новый JS-файл форка придётся
дописывать руками.

## Добавленные расширения

### `extensions/vscode-language-pack-ru/`

Встроенный русский language pack. Активируется автоматически через
`bootstrapBuiltInLanguagePack()` в `nls.ts`. Работает с первого запуска без перезапуска.

## Обновление upstream

```bash
git fetch upstream --tags

# Git LFS: extensions/copilot отслеживает тестовые фикстуры *.sqlite, и части блобов
# нет на LFS-сервере (404). Это данные simulation-тестов, для сборки не нужны.
# Отключаем smudge насовсем для этого клона — каждый терминал стартует заново,
# поэтому переменную окружения пришлось бы повторять в каждой команде:
git config --local filter.lfs.smudge "git-lfs smudge --skip -- %f"
git config --local filter.lfs.process "git-lfs filter-process --skip"

# Посмотреть конфликты, не трогая рабочее дерево:
git merge-tree --write-tree --name-only HEAD <тег>

git merge <тег>
```

Разрешение конфликтов, в порядке реальной экономии времени:

1. **Сначала проверь, не сделал ли это уже upstream.** Большинство патчей форка либо
   уходят в upstream, либо теряют смысл после его рефакторинга. В мерже 1.123.2 20 из 22
   конфликтов свелись к «взять upstream», потому что задуманное форком там уже было.
   Сравнивай каждую сторону с базой мержа
   (`git diff $(git merge-base HEAD <тег>) HEAD -- <файл>`), прежде чем сливать руками.
2. **Ищи наши маркеры:** `git grep SKYCODE -- src/ build/`.
3. Лок-файлы и notices перегенерируй, а не сливай построчно.

### Автомерж молча теряет строки upstream

«Конфликта нет» не значит «слито правильно». Релизные теги режутся от релизных веток,
поэтому мерж такого тега в форк, куда уже влит более старый тег, даёт базу мержа далеко
в точке ветвления. В таких регионах git разрешает молча и не всегда оставляет более новую
сторону. Мерж 1.136.1 потерял четыре строки в `chatService.ts`, одну в
`sandboxHelperService.ts` и половину импорта в sandbox-тесте — ни одной из них не было в
списке конфликтов, все были чистым upstream-кодом, и сборка сломалась.

После каждого мержа делай сплошную сверку:

```bash
git diff --name-only <тег> HEAD -- src/ build/ extensions/copilot/
```

Каждый файл в списке должен объясняться: либо в нём есть маркер `SKYCODE`, либо его diff —
это добавления форка. Файл, у которого diff относительно тега состоит только из удалений,
и есть потеря автомержа — восстанавливай через `git checkout <тег> -- <файл>`.

## Чеклист после мержа

- [ ] `git grep -c SKYCODE -- src/ build/` — число маркеров совпадает с указанным выше;
      уменьшилось — значит автомерж съел патч
- [ ] `product.json` — имя "Skycode", в `extensionAllowedProposedApi` есть `skycode.skycode`
- [ ] `main.ts` — дефолтная локаль и патч argv.json на месте
- [ ] `nls.ts` — присутствует `bootstrapBuiltInLanguagePack()`
- [ ] `viewsExtensionPoint.ts` — fallback в `getViewContainer` на месте
- [ ] `extHostCodeInsets.ts` — `line + 1` на месте
- [ ] `npm run compile` — 0 ошибок
- [ ] `.\scripts\code.bat` — приложение стартует, UI на русском с первого запуска, панель
      Skycode открывается, кнопки Accept/Reject в diff стоят на своей строке
- [ ] `npm run gulp vscode-win32-x64` — про обязательный пин `VCToolsVersion` см.
      [getting-started.md](./getting-started.md)
