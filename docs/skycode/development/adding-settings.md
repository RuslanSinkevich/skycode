> **English version:** [adding-settings.md](../en/development/adding-settings.md)

# Добавление настроек

Порядок добавления новой настройки в Skycode AI. Пути относительно `extensions/skycode/`.

## Путь настройки

```
Webview (React)                      Расширение (Node.js)
SettingsSection.tsx                  updateSettings.ts
  updateSetting("key", value)  ──►     StateManager.setGlobalState(...)
                                       getStateToPostToWebview()  ──►  ExtensionState
ExtensionStateContext  ◄──────────────────────────────────────────────┘
```

Webview вызывает метод сервиса состояния (gRPC-сообщение `UpdateSettingsRequest`). Расширение сохраняет значение и отправляет обновлённое состояние обратно.

## Шаги

### 1. Proto

`proto/skycode/state.proto`, сообщение `UpdateSettingsRequest`:

```protobuf
message UpdateSettingsRequest {
  optional bool my_new_setting = 60;  // пример: возьмите следующий свободный номер в этом сообщении
}
```

Номер должен быть новым: не использовать номера, помеченные `reserved`, и не менять существующие.

### 2. Генерация кода

```bash
npm run protos
```

### 3. Описание ключа

`src/shared/storage/state-keys.ts`. Пользовательские настройки добавляются в `USER_SETTINGS_FIELDS` вместе со значением по умолчанию:

```typescript
myNewSetting: { default: true as boolean },
```

Внутреннее состояние (не настройка пользователя) добавляется в `GLOBAL_STATE_FIELDS`.

### 4. Тип состояния для webview

`src/shared/ExtensionMessage.ts`, интерфейс `ExtensionState`:

```typescript
myNewSetting?: boolean
```

### 5. Сохранение

`src/core/controller/state/updateSettings.ts`:

```typescript
if (request.myNewSetting !== undefined) {
  controller.stateManager.setGlobalState("myNewSetting", !!request.myNewSetting)
}
```

### 6. Отправка в webview

`src/core/controller/index.ts`, метод `getStateToPostToWebview()`:

```typescript
myNewSetting: this.stateManager.getGlobalSettingsKey("myNewSetting"),
```

### 7. Значение по умолчанию в webview

`webview-ui/src/context/ExtensionStateContext.tsx`, начальное состояние `useState<ExtensionState>`:

```typescript
myNewSetting: true,
```

### 8. Интерфейс

Выберите раздел в `webview-ui/src/components/settings/sections/` (например `GeneralSettingsSection.tsx`, `EditingSection.tsx`, `ContextSection.tsx`, `PermissionsSection.tsx`) и добавьте элемент:

```tsx
const { myNewSetting } = useExtensionState()

<VSCodeCheckbox
  checked={myNewSetting}
  onChange={(e: any) => updateSetting("myNewSetting", e.target.checked === true)}>
  Подпись настройки
</VSCodeCheckbox>
```

Подписи берите из словарей `webview-ui/src/i18n/locales/ru.json` и `en.json` (функция `t("ключ")`).

### 9. Настройка VS Code (необязательно)

Если настройка должна быть видна в стандартном окне настроек VS Code, добавьте её в `contributes.configuration.properties` в `package.json` (примеры: `skycode.indexing.*`, `skycode.validateSyntaxBeforeApply`). Это отдельный механизм, он не заменяет шаги выше.

## Чеклист

- [ ] Поле в `proto/skycode/state.proto` с новым номером
- [ ] `npm run protos`
- [ ] Ключ в `USER_SETTINGS_FIELDS` (или `GLOBAL_STATE_FIELDS`) в `state-keys.ts`
- [ ] Поле в `ExtensionState`
- [ ] Сохранение в `updateSettings.ts`
- [ ] Отправка в `getStateToPostToWebview()`
- [ ] Значение по умолчанию в `ExtensionStateContext.tsx`
- [ ] Элемент интерфейса и подписи в `ru.json` и `en.json`
- [ ] Проверено: значение сохраняется после перезагрузки окна
