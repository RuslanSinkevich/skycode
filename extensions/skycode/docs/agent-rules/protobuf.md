# Protobuf правила для агента

## Файлы

Proto файлы: `proto/skycode/*.proto`

## После изменений

```bash
npm run protos
```

## Генерация

- `src/shared/proto/` — общие типы
- `src/generated/grpc-js/` — сервисы
- `src/generated/nice-grpc/` — Promise клиенты
- `src/generated/hosts/` — хэндлеры

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
