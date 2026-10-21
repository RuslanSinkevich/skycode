> **English version:** [network.md](../en/development/network.md)

# Сетевые запросы и прокси

Код расширения должен ходить в сеть через обёртки из `src/shared/net.ts`. Они учитывают настройки прокси VS Code. Глобальный `fetch` и axios «из коробки» в части окружений прокси не подхватывают.

Пути относительно `extensions/skycode/`.

## Правила

### fetch

```typescript
// Неверно
const response = await fetch("https://api.example.com/data")

// Верно
import { fetch } from "@/shared/net"
const response = await fetch("https://api.example.com/data")
```

### axios

```typescript
import axios from "axios"
import { getAxiosSettings } from "@/shared/net"

const response = await axios.get("https://api.example.com", {
  headers: { Authorization: "..." },
  ...getAxiosSettings(),
})
```

### Клиенты провайдеров (OpenAI и другие)

Большинство клиентов принимают свой экземпляр `fetch`:

```typescript
import OpenAI from "openai"
import { fetch } from "@/shared/net"

const client = new OpenAI({ apiKey: "...", fetch })
```

### Webview

В `webview-ui/` глобальный `fetch` допустим: прокси обрабатывает сам браузер.

## Тесты

Тесты расширения используют mocha и sinon. Чтобы подменить сеть, используйте `mockFetchForTesting`. Он подменяет `fetch` на время вызова колбэка и возвращает его результат.

```typescript
import sinon from "sinon"
import { mockFetchForTesting } from "@/shared/net"

it("my test", async () => {
  const stubFetch = sinon.stub().resolves(new Response("{}"))
  await mockFetchForTesting(stubFetch as unknown as typeof fetch, async () => {
    await myFunctionThatUsesFetch()
  })
})
```

Пример в коде: `src/core/api/providers/__tests__/litellm.test.ts`.

## Чеклист для нового сетевого вызова

1. Импортирован `@/shared/net`.
2. Используется `fetch` из `@/shared/net`, а не глобальный.
3. Для axios добавлено `...getAxiosSettings()`.
4. Клиенты провайдеров получают `fetch` из `@/shared/net`.
5. Адрес не жёстко прописан без причины: Skycode работает в закрытых сетях, куда внешние адреса часто недоступны. Если вызов нужен, он должен включаться действием пользователя, а не происходить молча.
