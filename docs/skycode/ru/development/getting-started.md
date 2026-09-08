> **English version:** [getting-started.md](../../development/getting-started.md)

# Руководство по разработке

## Требования

- Node.js — ровно та версия, что указана в `vscode/.nvmrc` (24.15.0 на upstream 1.123.2)
- Python 3.x (для сборки нативных модулей VS Code)
- C++ build tools (Visual Studio Build Tools на Windows)
- Git с установленным Git LFS

## Быстрый старт

```bash
# Клонирование
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/vscode

# Установка зависимостей (на Windows сначала прочитай раздел про тулсет ниже)
npm install

# Запуск в режиме разработки
# Windows:
.scriptscode.bat
# macOS/Linux:
./scripts/code.sh
```

## Windows: пин тулсета MSVC

Любая команда, собирающая нативные модули, должна запускаться с пином `VCToolsVersion`:

```bash
VCToolsVersion=14.41.34120 npm ci
```

Electron 42 (upstream 1.123.2 и новее) требует Spectre-mitigated библиотек MSVC. Это
необязательный компонент Visual Studio, и обычно он установлен только для **одного**
тулсета, тогда как MSBuild по умолчанию берёт самый новый из найденных — сборка падает с
`MSB8040: для этого проекта требуются библиотеки с устранением рисков Spectre`.

Посмотреть, у каких тулсетов они реально есть:

```bash
ls "/c/Program Files/Microsoft Visual Studio/"*/*/VC/Tools/MSVC/*/lib/spectre
```

Пини `VCToolsVersion` на версию из этого списка. Доустановить Spectre-библиотеки для
нового тулсета через Visual Studio Installer тоже можно, но это закачка на несколько
гигабайт. Пин не сохраняется между запусками терминала — указывай его в той же команде
каждый раз.

## Переустановка зависимостей после мержа upstream

`npm ci` чистит только **корневой** `node_modules`. У каждой папки внутри `extensions/`
своё дерево, поэтому после смены версии upstream там остаются старые пакеты — обычно
устаревший `@types/node`, из-за которого `npm run compile` падает в файлах, которых мерж
вообще не касался.

Обновить их:

```bash
VSCODE_FORCE_INSTALL=1 npm_command=install VCToolsVersion=14.41.34120 node build/npm/postinstall.ts
```

Обе переменные здесь обязательны:

- `npm_command=install` — `build/npm/postinstall.ts` берёт подкоманду из
  `process.env['npm_command']`. При запуске через `npm run postinstall` туда попадает
  `run-script`, и скрипт выполняет в каждой папке `npm run-script`, который просто
  печатает список доступных скриптов. Он завершается с кодом 0, не установив ничего.
  Запуск файла напрямую через `node` — то, что позволяет явному значению уцелеть.
- `VSCODE_FORCE_INSTALL=1` — обходит кеш актуальности в
  `node_modules/.postinstall-state`. Прерванный запуск может оставить в этом кеше отметку,
  что всё уже свежее.

После этого проверь, что какое-нибудь расширение соответствует своему лок-файлу:

```bash
node -e "console.log(require('./extensions/git/node_modules/@types/node/package.json').version)"
```

## Полная сборка дистрибутива

```bash
VCToolsVersion=14.41.34120 npm run gulp vscode-win32-x64
```

Результат — в `../VSCode-win32-x64` (`Skycode.exe`, а не `code.exe`). Задача начинается с
удаления этой папки, поэтому переименуй предыдущую сборку, если она ещё нужна.

## Сборка расширения

```bash
# Сборка webview UI
cd vscode/extensions/skycode/webview-ui
npm run build

# Сборка бэкенда расширения
cd ..
node esbuild.mjs
```

## Проверка типов

```bash
npm run compile
# или
npx tsc --noEmit
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

## Changesets

Для значимых пользовательских изменений:

```bash
npm run changeset
```

Создавать только **patch** версии. Пропускать для мелких фиксов, внутренних рефакторингов и невидимых UI-изменений.

## Регенерация снапшотов

После изменения промптов:

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## См. также

- [Добавление инструментов](./adding-tools.md)
- [Сетевые запросы](./network.md)
- [Добавление настроек](./adding-settings.md)
- [Патчи форка](./fork-patches.md)
