> **English version:** [getting-started.md](../en/development/getting-started.md)

# Руководство по разработке

Skycode — расширение VS Code, код лежит в `extensions/skycode/`. Репозиторий физически остаётся форком VS Code, но собирать VS Code целиком (`npm install` в корне, gulp, `scripts/code.*`) для Skycode не нужно. Все команды ниже запускаются из `extensions/skycode`. Пути в тексте относительно этой папки, если не сказано иное.

## Требования

- VS Code 1.90 или новее (минимальная версия движка в `package.json`).
- Node.js 22 или новее (так собирает CI) и npm.

## Быстрый старт

```bash
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/extensions/skycode

npm ci
cd webview-ui && npm ci && cd ..

npm run protos     # типы из proto/skycode/*.proto
npm run package    # типы + сборка webview + линт + продакшен-бандл
```

Сгенерированный код (`src/shared/proto/`, `src/generated/`, `webview-ui/src/services/grpc-client.ts`) в git не хранится. `npm run protos` нужен после клонирования и после любой правки `.proto`.

Для разработки: `npm run dev` (protos и watch для esbuild и tsc), `npm run dev:webview` (dev-сервер Vite для webview), `node esbuild.mjs` (только бандл расширения).

## Запуск и проверка

- Собрать пакет (`npm run package:vsix`, результат `dist/skycode.vsix`), установить через «Установить из VSIX…» и выполнить **Developer: Reload Window**.
- Или открыть `extensions/skycode` в VS Code и запустить конфигурацию «Run Extension (local)» из `.vscode/launch.json` (F5).

## Проверки

| Что | Команда |
|---|---|
| Типы расширения | `npx tsc --noEmit -p .` |
| Типы тестов | `npx tsc --noEmit -p tsconfig.test.json` |
| Типы webview | `cd webview-ui && npx tsc --noEmit -p tsconfig.app.json` |
| Линт | `npx biome lint --diagnostic-level=error src webview-ui/src` |
| Юнит-тесты расширения (mocha) | `npm run test:unit` |
| Тесты webview (vitest) | `cd webview-ui && npx vitest run` |
| Обновить снапшоты промптов | `UPDATE_SNAPSHOTS=true npm run test:unit` |

Тесты расширения используют mocha, chai и sinon. Файлы лежат в папках `__tests__` рядом с кодом.

## Упаковка и релиз

```bash
npx vsce package --readme-path MARKETPLACE.md
```

`MARKETPLACE.md` — текст страницы в Marketplace. `README.md` в папке расширения — индекс для разработчиков.

Релиз:

1. Поднять `version` в `extensions/skycode/package.json`.
2. Запушить тег `ext-vX.Y.Z` (версия в теге должна совпадать с `package.json`).
3. Workflow `.github/workflows/skycode-extension.yml` соберёт расширение, прогонит юнит-тесты, опубликует в VS Code Marketplace (секрет `VSCE_PAT`; без него workflow пробует `vsce publish --oidc`, Marketplace его пока не поддерживает) и приложит `.vsix` к GitHub Release. В Open VSX публикуется только если задан секрет `OVSX_PAT`.

Ручной запуск workflow (Actions, Skycode Extension, Run workflow) только собирает `.vsix` в артефакты.

## Что не входит в .vsix

По `.vscodeignore` в пакет не попадают `models/` (модели эмбеддингов) и `onnxruntime-node`. Поэтому локальный режим индексации в установленном расширении недоступен. Голосовые компоненты и headless-браузер тоже скачиваются при первом использовании.

## gRPC и Protobuf

Расширение и webview общаются сообщениями, описанными в `proto/skycode/*.proto`.

```protobuf
service MyService { }      // PascalCase
rpc myMethod() { }         // camelCase
message MyMessage { }      // PascalCase
```

Правила:

- номера полей не менять и не переиспользовать;
- удалённое поле заменять на `reserved N;`;
- после правки выполнить `npm run protos`;
- `scripts/generate-state-proto.mjs` не запускать.

`npm run lint:proto` (входит в `npm run lint`) проверяет стиль имён.

### Новый RPC-метод

1. Добавить метод в `.proto`.
2. Создать обработчик в `src/core/controller/<домен>/`.
3. Вызвать из webview: `UiServiceClient.myMethod(request)` (клиент соответствующего сервиса).

## Состояние

Настройки и состояние описаны в `src/shared/storage/state-keys.ts`:

- `GLOBAL_STATE_FIELDS`: внутреннее состояние;
- `USER_SETTINGS_FIELDS`: пользовательские настройки;
- `API_HANDLER_SETTINGS_FIELDS`: параметры провайдеров;
- секреты (ключи API) хранятся отдельно в SecretStorage.

Чтение и запись: `controller.stateManager.getGlobalStateKey("key")`, `getGlobalSettingsKey("key")`, `setGlobalState("key", value)`. Полный порядок добавления настройки: [Добавление настроек](./adding-settings.md).

## Добавление провайдера моделей

Конвертация в proto есть в трёх местах. Если пропустить одно, выбор провайдера сбросится на значение по умолчанию.

1. `proto/skycode/models.proto`: добавить значение в `enum ApiProvider` (новый номер).
2. `convertApiProviderToProto()` в `src/shared/proto-conversions/models/api-configuration-conversion.ts`.
3. `convertProtoToApiProvider()` в том же файле.

Дополнительно:

- `src/shared/api.ts`: тип `ApiProvider` и модели;
- `src/shared/providers/providers.json`: список для выпадающего меню;
- `src/core/api/providers/`: класс провайдера и ветка в `createHandlerForProvider()` в `src/core/api/index.ts`;
- `webview-ui/src/components/settings/providers/`: форма настроек провайдера.

## См. также

- [Добавление инструментов](./adding-tools.md)
- [Добавление настроек](./adding-settings.md)
- [Сетевые запросы](./network.md)
