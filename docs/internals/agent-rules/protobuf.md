# Protobuf правила для агента

## Файлы

Proto файлы: `proto/skycode/*.proto`

## После изменений

```bash
npm run protos
```

## Генерация

- `src/shared/proto/` — общие типы
- `src/generated/hosts/` — сервисы и клиент host bridge
- `webview-ui/src/services/grpc-client.ts` — клиенты для webview

Все три в `.gitignore`.

## Правила

- Номера полей не менять и не переиспользовать; удалённое поле → `reserved N;`.
- `scripts/generate-state-proto.mjs` не запускать.

## Именование

```protobuf
service PascalCaseService { }
rpc camelCaseMethod() { }
message PascalCaseMessage { }
```

## Простые типы

Для простых данных — общие типы из `proto/skycode/common.proto`:
- `StringRequest`
- `Int64Request`
- `Empty`

## Новый enum

При добавлении значения в enum (например `SkycodeSay`) — обновить конверсию в:
`src/shared/proto-conversions/skycode-message.ts`

## Новый RPC метод

1. Добавить в `.proto`
2. Хэндлер в `src/core/controller/<domain>/`
3. Вызов из webview:
   ```typescript
   UiServiceClient.myMethod(MyRequest.create({ ... }))
   ```

## Стриминг

```protobuf
rpc subscribeToSomething(Request) returns (stream Response);
```
