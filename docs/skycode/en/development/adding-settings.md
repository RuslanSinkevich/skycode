> **Русская версия:** [adding-settings.md](../../development/adding-settings.md)

# Adding Settings

The order of adding a new setting to Skycode AI. Paths are relative to `extensions/skycode/`.

## The path of a setting

```
Webview (React)                      Extension (Node.js)
SettingsSection.tsx                  updateSettings.ts
  updateSetting("key", value)  ──►     StateManager.setGlobalState(...)
                                       getStateToPostToWebview()  ──►  ExtensionState
ExtensionStateContext  ◄──────────────────────────────────────────────┘
```

The webview calls a method of the state service (the gRPC message `UpdateSettingsRequest`). The extension saves the value and sends the updated state back.

## Steps

### 1. Proto

`proto/skycode/state.proto`, message `UpdateSettingsRequest`:

```protobuf
message UpdateSettingsRequest {
  optional bool my_new_setting = 60;  // example: take the next free number in this message
}
```

The number must be new: do not use numbers marked `reserved`, and do not change existing ones.

### 2. Generate code

```bash
npm run protos
```

### 3. Describe the key

`src/shared/storage/state-keys.ts`. User settings go into `USER_SETTINGS_FIELDS` together with a default value:

```typescript
myNewSetting: { default: true as boolean },
```

Internal state (not a user setting) goes into `GLOBAL_STATE_FIELDS`.

### 4. State type for the webview

`src/shared/ExtensionMessage.ts`, the `ExtensionState` interface:

```typescript
myNewSetting?: boolean
```

### 5. Saving

`src/core/controller/state/updateSettings.ts`:

```typescript
if (request.myNewSetting !== undefined) {
  controller.stateManager.setGlobalState("myNewSetting", !!request.myNewSetting)
}
```

### 6. Sending to the webview

`src/core/controller/index.ts`, method `getStateToPostToWebview()`:

```typescript
myNewSetting: this.stateManager.getGlobalSettingsKey("myNewSetting"),
```

### 7. Default in the webview

`webview-ui/src/context/ExtensionStateContext.tsx`, the initial state of `useState<ExtensionState>`:

```typescript
myNewSetting: true,
```

### 8. UI

Pick a section in `webview-ui/src/components/settings/sections/` (for example `GeneralSettingsSection.tsx`, `EditingSection.tsx`, `ContextSection.tsx`, `PermissionsSection.tsx`) and add the control:

```tsx
const { myNewSetting } = useExtensionState()

<VSCodeCheckbox
  checked={myNewSetting}
  onChange={(e: any) => updateSetting("myNewSetting", e.target.checked === true)}>
  Setting label
</VSCodeCheckbox>
```

Take labels from the dictionaries `webview-ui/src/i18n/locales/ru.json` and `en.json` (the `t("key")` function).

### 9. A VS Code setting (optional)

If the setting must be visible in the standard VS Code settings UI, add it to `contributes.configuration.properties` in `package.json` (examples: `skycode.indexing.*`, `skycode.validateSyntaxBeforeApply`). This is a separate mechanism and does not replace the steps above.

## Checklist

- [ ] A field in `proto/skycode/state.proto` with a new number
- [ ] `npm run protos`
- [ ] A key in `USER_SETTINGS_FIELDS` (or `GLOBAL_STATE_FIELDS`) in `state-keys.ts`
- [ ] A field in `ExtensionState`
- [ ] Saving in `updateSettings.ts`
- [ ] Sending in `getStateToPostToWebview()`
- [ ] A default in `ExtensionStateContext.tsx`
- [ ] A UI control and labels in `ru.json` and `en.json`
- [ ] Checked: the value persists after reloading the window
