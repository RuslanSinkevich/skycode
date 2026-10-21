> **Русская версия:** [network.md](../../development/network.md)

# Network Requests and Proxy

Extension code must go to the network through the wrappers in `src/shared/net.ts`. They honor the VS Code proxy settings. The global `fetch` and plain axios do not pick up the proxy in some environments.

Paths are relative to `extensions/skycode/`.

## Rules

### fetch

```typescript
// Wrong
const response = await fetch("https://api.example.com/data")

// Right
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

### Provider clients (OpenAI and others)

Most clients accept their own `fetch` instance:

```typescript
import OpenAI from "openai"
import { fetch } from "@/shared/net"

const client = new OpenAI({ apiKey: "...", fetch })
```

### Webview

In `webview-ui/` the global `fetch` is fine: the browser handles the proxy.

## Tests

Extension tests use mocha and sinon. To replace the network, use `mockFetchForTesting`. It swaps `fetch` for the duration of the callback and returns its result.

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

An example in the code: `src/core/api/providers/__tests__/litellm.test.ts`.

## Checklist for a new network call

1. `@/shared/net` is imported.
2. `fetch` comes from `@/shared/net`, not the global one.
3. For axios, `...getAxiosSettings()` is added.
4. Provider clients get `fetch` from `@/shared/net`.
5. The address is not hard-coded without a reason: Skycode runs in closed networks where external addresses are often unreachable. If the call is needed, it should start from a user action and not happen silently.
