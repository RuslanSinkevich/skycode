> **English version:** [getting-started.md](../en/development/getting-started.md)

# Руководство по разработке

Skycode — расширение VS Code, код лежит в `extensions/skycode/`. Репозиторий физически остаётся форком VS Code, но сборка VS Code целиком (`npm install` в корне, gulp, `scripts/code.*`) для Skycode не нужна. Все команды ниже — из `extensions/skycode`, пути в разделах ниже тоже относительно этой папки.

## Требования

- VS Code 1.90+ (минимальная версия движка в `package.json`)
- Node.js 22+ (версия, которой собирает CI) и npm

## Быстрый старт

```bash
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/extensions/skycode

npm ci
cd webview-ui && npm ci && cd ..

npm run protos     # генерация типов из proto
npm run package    # проверка типов + сборка webview + lint + esbuild (production)
```

Для разработки: `npm run dev` (protos + watch esbuild/tsc) и `npm run dev:webview` (Vite для webview).

## Запуск и проверка

- Установить собранный `.vsix` в обычный VS Code («Установить из VSIX…») и выполнить **Developer: Reload Window**.
- Либо открыть `extensions/skycode` в VS Code и запустить Extension Development Host (F5).

## Тесты

```bash
npm run test:unit                    # mocha, юнит-тесты расширения
cd webview-ui && npx vitest run      # тесты webview
```

## Сборка .vsix

```bash
npx vsce package --readme-path MARKETPLACE.md
```

`MARKETPLACE.md` — текст страницы в Marketplace; `README.md` в папке расширения — индекс для разработчиков.

## Релиз

1. Поднять `version` в `extensions/skycode/package.json`.
2. Запушить тег `ext-vX.Y.Z` (версия в теге должна совпадать с `package.json`).
3. Workflow `.github/workflows/skycode-extension.yml` соберёт расширение, прогонит юнит-тесты, опубликует в VS Code Marketplace (секрет `VSCE_PAT`; переход на trusted publishing через `vsce publish --oidc` запланирован, когда Marketplace его поддержит) и приложит `.vsix` к GitHub Release. В Open VSX публикуется только если задан секрет `OVSX_PAT`.

Ручной запуск workflow (Actions → Skycode Extension → Run workflow) только собирает `.vsix` в артефакты.

## Проверка типов

```bash
npm run check-types
```

## gRPC / Protobuf коммуникация

Расширение и webview общаются через gRPC-подобный протокол.

### Proto-файлы

Расположение: `proto/skycode/*.proto`

```protobuf
service MyService { }      // PascalCase
rpc myMethod() { }         // camelCase
message MyMessage { }      // PascalCase
```

### После изменения Proto-файлов

```bash
npm run protos
```

Генерирует типы в:

- `src/shared/proto/`
- `src/generated/grpc-js/`
- `src/generated/nice-grpc/`
- `src/generated/hosts/`

### Добавление нового RPC-метода

1. Добавить в `.proto` файл
2. Создать обработчик в `src/core/controller/<domain>/`
3. Вызвать из webview: `UiServiceClient.myMethod(request)`

## GlobalState

### Добавление нового ключа

1. Добавить поле в `GLOBAL_STATE_FIELDS` в `src/shared/storage/state-keys.ts`:

   ```typescript
   const GLOBAL_STATE_FIELDS = {
     myKey: { default: undefined as string | undefined },
   } satisfies FieldDefinitions
   ```

2. Считать в `getStateToPostToWebview`:

   ```typescript
   myKey: stateManager.getGlobalStateKey("myKey"),
   ```

3. Использовать:

   ```typescript
   controller.stateManager.setGlobalState("myKey", value)
   controller.stateManager.getGlobalStateKey("myKey")
   ```

## Добавление API-провайдера

Три места для proto-конвертации (иначе сбросится на Anthropic):

1. `proto/skycode/models.proto` — добавить в enum `ApiProvider`
2. `convertApiProviderToProto()` в `src/shared/proto-conversions/models/api-configuration-conversion.ts`
3. `convertProtoToApiProvider()` в том же файле

Дополнительно:

- `src/shared/api.ts` — union type и модели
- `src/shared/providers/providers.json` — для выпадающего списка
- `src/core/api/index.ts` — обработчик в `createHandlerForProvider()`
- Webview-компоненты

## Регенерация снапшотов

После изменения промптов:

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## См. также

- [Добавление инструментов](./adding-tools.md)
- [Сетевые запросы](./network.md)
- [Добавление настроек](./adding-settings.md)
