# Сборка, проверка и релиз расширения

Все команды выполняются из папки `extensions/skycode` (репозиторий `RuslanSinkevich/skycode`). Расширение ставится в обычный VS Code 1.90+; форка VS Code и отдельной сборки редактора больше нет.

## Быстрый старт

```bash
npm ci
cd webview-ui && npm ci && cd ..
npm run protos     # генерация TypeScript из proto/skycode/*.proto
npm run package    # типы + сборка webview + линт + продакшен-бандл esbuild
```

`npm run protos` обязателен после клонирования и после любого изменения `.proto`. Сгенерированное (`src/shared/proto/`, `src/generated/`, `webview-ui/src/services/grpc-client.ts`) в git не хранится.

Для итераций: `node esbuild.mjs` (только бандл расширения), `npm run watch` (esbuild + tsc в watch), `npm run dev:webview` (dev-сервер webview).

## Проверки

| Что | Команда |
|---|---|
| Юнит-тесты (mocha) | `npm run test:unit` |
| Тесты webview | `cd webview-ui && npx vitest run` |
| Типы расширения | `npx tsc --noEmit -p .` |
| Типы тестов | `npx tsc --noEmit -p tsconfig.test.json` |
| Типы webview | `cd webview-ui && npx tsc --noEmit -p tsconfig.app.json` |
| Линт | `npx biome lint --diagnostic-level=error src webview-ui/src` |
| Обновить снапшоты промптов | `UPDATE_SNAPSHOTS=true npm run test:unit` |

Правила для proto: номера полей не переиспользовать и не менять, удалённые поля — `reserved N;`, `scripts/generate-state-proto.mjs` не запускать.

## Попробовать локально

1. Собрать .vsix: `npm run package:vsix` (результат — `dist/skycode.vsix`) или напрямую `npx vsce package --readme-path MARKETPLACE.md`.
2. В VS Code: Extensions → `...` → Install from VSIX.
3. `Developer: Reload Window`.

## Релиз

1. Поднять `version` в `extensions/skycode/package.json` и дописать запись в `CHANGELOG.md` (его показывает вкладка «Изменения» в Marketplace).
2. Запушить тег `ext-vX.Y.Z` (версия в теге должна совпадать с `package.json`).
3. Workflow `.github/workflows/skycode-extension.yml` (корень репозитория) ставит зависимости, собирает, прогоняет юнит-тесты, пакует .vsix, публикует в Visual Studio Marketplace (расширение `skycode.skycode-ai`) и прикладывает .vsix к GitHub Release. Секрет `VSCE_PAT` задаёт токен публикации; без него workflow пробует trusted publishing (`vsce --oidc`), который Marketplace пока не поддерживает. Open VSX — только при заданном секрете `OVSX_PAT`.
4. Ручной запуск workflow (Run workflow) только собирает .vsix в артефакты.

## Что не входит в .vsix

По `.vscodeignore` в пакет не попадает `models/` (модель эмбеддингов), а `onnxruntime-node` помечен как external в `esbuild.mjs` и не бандлится, поэтому локальный режим индексации в установленном расширении недоступен. Индексация выключена по умолчанию, режим `remote` работает, `codebase_search` работает и без индекса. Подробнее: [INDEXING_SYSTEM.md](./INDEXING_SYSTEM.md).

## Если сборка ломается

- Ошибки типов, `Cannot find module` или странное состояние после слияний: удалить `node_modules`, `dist`, `src/generated`, `src/shared/proto`, затем заново `npm ci` и `npm run protos`.
- На Windows `npm` иногда не скачивает `protoc.exe` в `node_modules/grpc-tools/bin`. Тогда скачать `protoc-3.20.3-win64.zip` с https://github.com/protocolbuffers/protobuf/releases, положить `bin/protoc.exe` в `node_modules/grpc-tools/bin/`, а папку `include` — рядом с ним, и повторить `npm run protos`.

## Голосовой ввод

Движок GigaAM, его модель и ffmpeg в .vsix не входят, они скачиваются при первом включении. См. [VOICE_INPUT.md](./VOICE_INPUT.md). Воркер диктовки собирается отдельной записью в `esbuild.mjs` (`dist/sherpa-dictation-worker.js`).

## Миграция с прежнего ID

При первой активации расширение копирует историю задач из хранилища старого ID `skycode.skycode` (`src/hosts/vscode/migrateLegacyStorage.ts`).
