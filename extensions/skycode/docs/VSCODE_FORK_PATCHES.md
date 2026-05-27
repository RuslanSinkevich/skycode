# VS Code Fork: Список патчей ядра

> Все наши правки помечены маркерами `SKYCODE_FORK_BEGIN` / `SKYCODE_FORK_END` или `[SKYCODE]`.
> При обновлении upstream: `git grep "SKYCODE_FORK\|[SKYCODE]" -- src/ build/ product.json` покажет все наши изменения.
> Upstream база: **1.121.0** (ветка `merge/1.121.0`)
> Последнее обновление: 2026-05-27

Публичная краткая версия этого файла живёт в `docs/development/fork-patches.md` (корень монорепы). Этот документ — **canonical**; публичный синхронизируется с него.

---

## Изменённые файлы ядра

### 1. `product.json`
**Что:** Брендинг + идентификаторы ОС + конфигурация

Брендинг:
- `nameShort` / `nameLong` → "Skycode"
- `applicationName` → "skycode"
- `dataFolderName` → ".skycode"
- `urlProtocol` → "skycode"
- `win32DirName` / `win32NameVersion` / `win32RegValueName` → "Skycode"
- `win32MutexName` → "skycode"
- `linuxIconName` → "skycode"

Идентификаторы ОС (критично для Taskbar / Dock / service registration):
- `win32AppUserModelId` → "SkycodeAI.Skycode" (было `Microsoft.CodeOSS`)
- `darwinBundleIdentifier` → "ru.skycode-ai.skycode" (было `com.visualstudio.code.oss`)
- `win32TunnelServiceMutex` → "skycode-tunnelservice"
- `win32TunnelMutex` → "skycode-tunnel"
- `serverApplicationName` → "skycode-server"
- `serverDataFolderName` → ".skycode-server"
- `tunnelApplicationName` → "skycode-tunnel"

Интеграция расширения:
- `extensionAllowedProposedApi` → `["skycode.skycode"]` (для editorInsets)
- `defaultChatAgent` → **upstream** (`GitHub.copilot` / `GitHub.copilot-chat`) — не отключаем, проще мержить
- `extensionsGallery`, `onboardingKeymaps`, `onboardingThemes` — из upstream 1.121

**Риск конфликта при обновлении:** СРЕДНИЙ — при мерже оставить Skycode-поля (nameShort, dataFolderName, …), `defaultChatAgent` брать из upstream.

---

### 2. `src/vs/workbench/contrib/chat/browser/chatParticipant.contribution.ts`
**Что:** Только брендинг контейнера (Copilot Chat view **не** отключаем)
- `title` контейнера → `{ value: 'Skycode', original: 'Skycode' }` (без `localize2`, чтобы RU locale не подменял на «Чат»)
- `ChatViewPane` и остальной upstream-код — как в Microsoft

**Риск конфликта при обновлении:** ВЫСОКИЙ — при мерже: `git checkout --theirs` на файл, затем вручную вернуть одну строку `title: { value: 'Skycode', ... }`.

---

### 3. `src/main.ts`
**Что:** Дефолтная локаль `ru` + автопатч argv.json
- В `createDefaultArgvConfigSync()` — шаблон `argv.json` содержит `"locale": "ru"`
- В `getUserDefinedLocale()` — fallback `return 'ru'` если locale не задан нигде
- В `readArgvConfigSync()` — если `argv.json` существует, но `locale` не задан, дописывает `"locale": "ru"` и пересоздаёт объект через spread (`{ ...argvConfig, locale: 'ru' }`)

**Маркеры:** `SKYCODE_FORK_BEGIN: ensure Russian locale by default`, `[SKYCODE] Default UI language`, `[SKYCODE] Default to Russian`

**Риск конфликта при обновлении:** НИЗКИЙ — шаблон argv.json и getUserDefinedLocale меняются редко

---

### 4. `src/vs/base/node/nls.ts`
**Что:** Автогенерация `languagepacks.json` из встроенного языкового пакета при первом запуске
- В `resolveNLSConfiguration()` — если `languagePacks` не найден или не содержит нужный язык, вызывается `bootstrapBuiltInLanguagePack()`
- `bootstrapBuiltInLanguagePack()` — сканирует `extensions/vscode-language-pack-{locale}/`, парсит `package.json`, генерирует `languagepacks.json` в `userDataPath`
- Решает проблему "первый запуск на английском, нужен перезапуск" — теперь русский сразу

**Маркер:** `SKYCODE_FORK_BEGIN: bootstrap language pack from built-in extension on first launch`

**Риск конфликта при обновлении:** СРЕДНИЙ — если Microsoft изменит формат languagepacks.json или NLS-пайплайн

---

### 5. `src/vs/workbench/api/browser/viewsExtensionPoint.ts`
**Что:** Фикс резолва view container по прямому ID
- В методе `getViewContainer()` добавлен fallback: `|| this.viewContainersRegistry.get(value)`
- Без этого расширения не могут регистрировать views в core-контейнерах (например `workbench.panel.chat`)
- Оригинальный код искал только по `workbench.view.extension.{value}` — не находил core-контейнеры

**Маркер:** `[SKYCODE] Fallback: also try the raw value`

**Риск конфликта при обновлении:** СРЕДНИЙ — метод может измениться если Microsoft добавит новые well-known контейнеры

---

### 6. `src/vs/workbench/api/common/extHostCodeInsets.ts`
**Что:** Фикс позиционирования View Zone insets
- Убран `+1` к параметру `line` при создании `WebviewEditorInset`
- Без этого фикса diff-кнопки Accept/Reject отображаются на строку ниже

**Риск конфликта при обновлении:** СРЕДНИЙ — файл редко меняется, но если API insets изменится — проверить

---

### 7. `src/vs/workbench/contrib/chat/browser/chatSetup/chatSetupContributions.ts`
**Что:** Отключён Copilot Code Actions Provider
- `ChatCodeActionsProvider.registerProvider()` заменён на `codeActionsProviderDisposables.clear()`
- Удалён неиспользуемый импорт `ChatCodeActionsProvider`
- Убраны Copilot'овские AI Code Actions (Fix, Explain, Generate) из hover ошибок

**Маркер:** `SKYCODE_FORK_BEGIN: disable Copilot Code Actions Provider`

**Риск конфликта при обновлении:** НИЗКИЙ

---

### 8. `src/vs/editor/contrib/hover/browser/markerHoverParticipant.ts`
**Что:** Убрана кнопка "✨ Fix (Ctrl+I)" из hover ошибок
- Удалён блок рендера AI code action (sparkle icon + `isAI`)
- Удалены неиспользуемые импорты: `ApplyCodeActionReason`, `ThemeIcon`, `Codicon`
- Skycode использует Quick Fix меню (Ctrl+.) → "Fix with Skycode"

**Маркер:** `SKYCODE_FORK_BEGIN: remove Copilot "Fix" button from error hover`

**Риск конфликта при обновлении:** НИЗКИЙ

---

### 9. `build/filters.ts`
**Что:** Исключение расширения skycode из проверки copyright-заголовков
- Добавлено `'!extensions/skycode/**'` в фильтр

**Маркер:** `SKYCODE_FORK_BEGIN: keep skycode files exempt from upstream copyright header check`

**Риск конфликта при обновлении:** НИЗКИЙ

---

### 10. `build/hygiene.ts`
**Что:** Разрешение Unicode в комментариях (кириллица)
- Добавлена функция `stripComments()` для удаления комментариев перед проверкой Unicode
- Проверка Unicode пропускает содержимое комментариев — можно писать русские комменты

**Маркер:** `SKYCODE_FORK_BEGIN: helper for unicode check with comment stripping`, `SKYCODE_FORK_BEGIN: allow any unicode in comments`

**Риск конфликта при обновлении:** НИЗКИЙ

---

## Изменения в расширении Skycode

### `extensions/skycode/src/extension.ts`
- Автооткрытие панели Skycode при первом запуске (`globalState` флаг `skycode.panelAutoShown`)

**Маркер:** `SKYCODE_FORK_BEGIN: auto-open Skycode panel on first launch`

### `extensions/skycode/src/services/telemetry/TelemetryService.ts`
- Убрано предупреждение "IDE telemetry is disabled" — в OSS-сборке телеметрия выключена по умолчанию, нагонять на пользователя незачем

**Маркер:** `SKYCODE_FORK_BEGIN: suppress telemetry warning`

### `extensions/skycode/.vscodeignore`
- Добавлены исключения: `bin/`, `proto/`, `scripts/`, `vendor/whisper/`, dev-файлы
- Экономия ~165 МБ в финальной сборке

### `extensions/skycode/package.json`
- `views` → перенесён в контейнер `workbench.panel.chat` (правый сайдбар AuxiliaryBar)
- `skycode-icon` — кастомная иконка (шрифт `skycode-bot.woff`) для терминалов и UI

### `extensions/skycode/assets/icons/skycode-bot.woff` / `skycode-bot.ttf`
- Шрифтовая иконка с логотипом Skycode "S" (сгенерирована из SVG через svgicons2svgfont → svg2ttf → ttf2woff)
- Используется как `ThemeIcon("skycode-icon")` в терминалах, создаваемых агентом

---

## Добавленные расширения

### `extensions/vscode-language-pack-ru/`
**Что:** Русский языковой пакет (built-in)
- Извлечён из `MS-CEINTL.vscode-language-pack-ru-latest.vsix`
- Активируется автоматически через `bootstrapBuiltInLanguagePack()` в `nls.ts`
- Не требует перезапуска — работает с первого запуска

**Риск конфликта при обновлении:** НЕТ — отдельная папка, не конфликтует

---

## Как обновлять upstream (упрощённо, с 1.121)

```powershell
# 1. fetch
git fetch upstream --tags

# 2. ветка
git checkout clean-main
git branch backup/pre-$(TAG)-update
git checkout -b merge/$(TAG)

# 3. merge без LFS smudge (иначе падает на copilot test cache)
$env:GIT_LFS_SKIP_SMUDGE = "1"
git merge $(TAG) --no-commit

# 4. конфликты
#    product.json — вручную: Skycode branding + upstream defaultChatAgent/Copilot
#    src/vs/workbench/contrib/chat/** — чаще --theirs, потом title Skycode
#    build/hygiene.ts — оставить SKYCODE unicode strip + upstream checkCopilotEnginesVersion
git grep "SKYCODE_FORK\|\[SKYCODE\]" -- src/ build/ product.json

# 5. обязательно после мержа
#    extHostCodeInsets.ts — line БЕЗ +1 (diff Accept/Reject)
#    extensions/skycode/package.json — engines.vscode ^$(TAG)

# 6. commit + smoke
git commit -m "Merge upstream VS Code $(TAG)"
```

Политика с 1.121: **не боремся с Copilot в ядре** — `defaultChatAgent` и chat UI из upstream; Skycode webview живёт в том же контейнере `workbench.panel.chat`.

---

## Как собрать production-билд (Windows)

```powershell
# 1. Собрать webview-ui
cd vscode\extensions\skycode\webview-ui
npm run build

# 2. Собрать расширение
cd ..
node esbuild.mjs

# 3. Собрать VS Code
cd ..\..
node --max-old-space-size=8192 node_modules\gulp\bin\gulp.js vscode-win32-x64-min

# 4. Результат в ../VSCode-win32-x64/Skycode.exe
```

---

## Оптимизация размера сборки

Выполнено 2026-02-24. Итог: **2.85 ГБ → 0.84 ГБ**.

| Что удалено/исключено | Экономия |
|---|---|
| 7 дублей ONNX-моделей (`paraphrase-multilingual`) | −1,839 МБ |
| `vendor/whisper/ggml-base.bin` (не нужен, base скачивается с сервера) | −141 МБ |
| `bin/` (protoc.exe, только для разработки) через `.vscodeignore` | −22 МБ |
| `proto/`, `scripts/`, dev-файлы через `.vscodeignore` | −0.6 МБ |
| `extension.js.bak` | −44 МБ |

**Что осталось в расширении (405 МБ):**
- `models/` — 153 МБ (2 модели, только `model_quantized.onnx`)
- `assets/voice/` — 149 МБ (whisper tiny zip)
- `dist/` — ~45 МБ (extension.js + tree-sitter wasm)
- `webview-ui/build/` — 6 МБ (React UI)
- `vendor/modules/` — 0.8 МБ (transformers.js)

---

## Чеклист после обновления

### `product.json`
- [ ] `nameShort` / `nameLong` = "Skycode"
- [ ] `applicationName` = "skycode", `dataFolderName` = ".skycode"
- [ ] `win32AppUserModelId` = "SkycodeAI.Skycode" (не `Microsoft.CodeOSS`)
- [ ] `darwinBundleIdentifier` = "ru.skycode-ai.skycode" (не `com.visualstudio.code.oss`)
- [ ] `linuxIconName` = "skycode" (не `code-oss`)
- [ ] `serverApplicationName` / `serverDataFolderName` / `tunnelApplicationName` — skycode-* (не `*-oss`)
- [ ] `win32TunnelServiceMutex` / `win32TunnelMutex` — "skycode-*" (не `vscodeoss-*`)
- [ ] `extensionAllowedProposedApi` содержит `skycode.skycode`
- [ ] `defaultChatAgent` — upstream Copilot (`GitHub.copilot`), не placeholder

### Core patches
- [ ] `chatParticipant.contribution.ts` — title контейнера `Skycode`, Copilot view зарегистрирован
- [ ] `main.ts` — `argv.json` шаблон: `"locale": "ru"`, `getUserDefinedLocale` fallback → `'ru'`, `readArgvConfigSync` патчит существующий argv.json
- [ ] `nls.ts` — `bootstrapBuiltInLanguagePack()` на месте
- [ ] `viewsExtensionPoint.ts` — `getViewContainer` имеет fallback на прямой ID
- [ ] `extHostCodeInsets.ts` — нет `+1` к line
- [ ] `chatSetupContributions.ts` — `ChatCodeActionsProvider` удалён из импорта, `codeActionsProviderDisposables.clear()`
- [ ] `markerHoverParticipant.ts` — импорты `ApplyCodeActionReason`, `ThemeIcon`, `Codicon` удалены
- [ ] `extensionSignatureVerificationService.ts` — `verify()` всегда возвращает trusted result
- [ ] `chat.contribution.ts` — `ChatStatusBarEntry` не регистрируется

### Build hygiene
- [ ] `build/filters.ts` — `!extensions/skycode/**`
- [ ] `build/hygiene.ts` — `stripComments()` + unicode в комментариях разрешён

### Extensions
- [ ] `extensions/vscode-language-pack-ru/` на месте
- [ ] `extensions/skycode/package.json` → views в `workbench.panel.chat`
- [ ] `extensions/skycode/.vscodeignore` — `bin/`, `proto/`, `scripts/`, `vendor/whisper/` исключены

### Smoke
- [ ] Сборка проходит без ошибок (`npm run compile` в extension, `.\scripts\code.bat` для форка)
- [ ] Skycode.exe запускается, панель Skycode открыта
- [ ] UI на русском языке с первого запуска (без перезапуска)
- [ ] Taskbar/Jump List на Windows показывает Skycode, а не Code OSS

---

## Новая подсистема: Система разрешений и безопасности (Permissions)

Добавлена 2026-03-02. Аудит и усиление безопасности auto-approval настроек.

### Что было
- Настройки `readFiles`, `editFiles` в UI были **пустышками** — файлы всегда читались автоматически, редактирование шло через DiffSystem (inline diffs с Accept/Reject), поэтому галочки ни на что не влияли.
- `executeSafeCommands` / `executeAllCommands` — команды выполнялись автоматически без approval (`didAutoApprove = true` был захардкожен).
- `deleteFiles` — удаление файлов не имело UI-настройки, шло через старый `confirmDeleteFile` (не был экспортирован в UI).
- `editNotebooks` — редактирование `.ipynb` файлов не имело approval, записывались напрямую.
- `Checkpoints` — галочка в UI, но система отключена в `task/index.ts` (закомментирована).

### Что сделано

**Убрано из UI (dead code, backend сохранён):**
- `readFiles` / `readFilesExternally` — убраны из `ACTION_METADATA` в `constants.ts`
- `editFiles` / `editFilesExternally` — убраны из `ACTION_METADATA`
- `Checkpoints` — убрана галочка из `EditingSection.tsx`

Код в `AutoApprovalSettings.ts` и `autoApprove.ts` сохранён для обратной совместимости.

**Добавлено:**
- `deleteFiles` — настройка auto-approval удаления файлов (default: `false`)
- `editNotebooks` — настройка auto-approval редактирования Jupyter блокнотов (default: `false`)
- `executeSafeCommands` / `executeAllCommands` — реализована реальная логика approval

**Новые файлы:**
- `src/core/permissions/CommandSafetyClassifier.ts` — классификация команд на safe/unsafe (whitelist-подход)
- `src/core/permissions/CommandSafetyClassifier.test.ts` — тесты (23+)
- `src/core/task/tools/__tests__/autoApprove.test.ts` — тесты AutoApprove
- `src/core/task/tools/handlers/__tests__/DeleteFileToolHandler.test.ts` — тесты approval удаления
- `src/core/task/tools/handlers/__tests__/EditNotebookToolHandler.approval.test.ts` — тесты approval notebooks

**Изменённые файлы:**
- `src/shared/AutoApprovalSettings.ts` — добавлены `deleteFiles`, `editNotebooks`
- `src/core/task/tools/autoApprove.ts` — новые case'ы FILE_DELETE, EDIT_NOTEBOOK
- `src/core/task/tools/handlers/ExecuteCommandToolHandler.ts` — реальная approval логика
- `src/core/task/tools/handlers/DeleteFileToolHandler.ts` — approval через autoApprover
- `src/core/task/tools/handlers/EditNotebookToolHandler.ts` — approval перед записью
- `src/core/task/tools/handlers/ApplyPatchHandler.ts` — approval для DELETE операций в patch
- `webview-ui/src/components/chat/auto-approve-menu/constants.ts` — новые пункты UI
- `webview-ui/src/components/settings/sections/EditingSection.tsx` — убрана галочка Checkpoints
- `webview-ui/src/i18n/locales/en.json` — ключи deleteFiles, editNotebooks
- `webview-ui/src/i18n/locales/ru.json` — ключи deleteFiles, editNotebooks

**Маркеры:** `[SKYCODE]` в изменённых файлах

---

## Новая подсистема: Индексация кодовой базы

Подробная документация: [`docs/INDEXING_SYSTEM.md`](./INDEXING_SYSTEM.md)

Добавлена полная система семантической индексации:
- Локальные эмбеддинги через transformers.js (WASM, офлайн)
- Опция удалённого API (OpenAI-compatible)
- Хранение: SQLite (`index.db`) с fallback на JSON/binary (`~/.skycode/indexing/`)
- FileWatcher для инкрементальных обновлений
- SearchEngine: hybrid retrieval (semantic + keyword) + rerank
- Инструмент агента `codebase_search` (tool spec + handler + регистрация в prompt variants)
- UI таб "Индексация" в настройках Skycode

---

## Post-audit security hardening (2026-05-01)

По результатам полного аудита кодовой базы внесён ряд правок. Подробности — в корневом [`CHANGELOG.md`](../../../../CHANGELOG.md) и [`SECURITY.md`](../../../../SECURITY.md).

Ключевые изменения:

### Новый модуль `src/services/browser/urlSafety.ts`
Лексическая проверка URL перед обращением к внешним ресурсам. Отклоняет:
- Схемы кроме `http`/`https` (опционально настраиваемо).
- Loopback / link-local / private / CGNAT / multicast IPv4 и IPv6 (включая AWS metadata `169.254.169.254`).
- Hostname'ы `localhost`, `*.local`, `*.internal` и т.п.
- URL с credentials (`user:pass@host`).

Интегрирован в:
- `services/browser/UrlContentFetcher.urlToMarkdown` — `page.goto()` теперь получает уже прошедший проверку URL.
- `core/task/tools/handlers/WebFetchToolHandler.execute` — ранний отказ до запуска браузера; возвращает `UnsafeUrlError` в модель.

### Workspace containment
`core/controller/file/openFileRelativePath`: абсолютный путь нормализуется (`path.resolve`) и сверяется с `vscode.workspace.workspaceFolders`. Попытка открыть что-либо вне workspace логируется и отклоняется.

### Webview channel hardening
`hosts/vscode/VscodeWebviewProvider`:
- `executeVsCodeCommand` принимается только при `context.extensionMode === Development`.
- `updateIndexingConfig` разрешает только ключи из `ALLOWED_INDEXING_CONFIG_KEYS` (совпадает с `package.json > contributes`).

### Zip Slip
`services/browser/utils.ts → downloadSkycodeChromium`: перед `extractAllTo` каждая запись архива проверяется на абсолютные пути и containment внутри `extractDir`.

### Markdown + ModelPicker XSS
- `webview-ui/components/common/MarkdownBlock.tsx` — в pipeline `react-remark` после `rehype-raw` добавлен `rehype-sanitize` с whitelist для классов подсветки (`language-*`, `hljs-*`). Зависимость `rehype-sanitize ^6` добавлена в `webview-ui/package.json`.
- `webview-ui/components/history/HistoryView.tsx` — функция `highlight`, используемая модель-пикерами, теперь HTML-escape'ит входные подстроки и имя класса перед построением разметки для `dangerouslySetInnerHTML`.

### Зависимости
- `onnxruntime-node` синхронизирован с `onnxruntime-web` (`^1.14.0` → `^1.24.0`).
- `@playwright/test` и `@tailwindcss/vite` перемещены из `dependencies` в `devDependencies` (build/e2e-только).
- `tailwindcss` удалён из runtime-деп extension (живёт в `webview-ui`).

### Документация
- Создан `SECURITY.md` (disclosure process, scope, hardening notes для пользователей).
- Создан `CHANGELOG.md` (канонический changelog; Unreleased-секция описывает все правки выше).
- `.gitignore` дополнен: `evals.env`, `_ts_over_*.txt`, `gulp-prod*.log`, `build_*.log`.
