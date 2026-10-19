> **Русская версия:** [getting-started.md](../../development/getting-started.md)

# Development Guide

Skycode is a VS Code extension; its code lives in `extensions/skycode/`. The repository is still physically a VS Code fork, but building VS Code itself (root `npm install`, gulp, `scripts/code.*`) is not needed for Skycode. All commands below run from `extensions/skycode`, and paths in the sections below are relative to that folder.

## Prerequisites

- VS Code 1.124+ (minimum engine version in `package.json`)
- Node.js 22+ (the version CI builds with) and npm

## Quick Start

```bash
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/extensions/skycode

npm ci
cd webview-ui && npm ci && cd ..

npm run protos     # generate types from proto
npm run package    # type check + webview build + lint + esbuild (production)
```

For development: `npm run dev` (protos + esbuild/tsc watch) and `npm run dev:webview` (Vite for the webview).

## Running and Trying It

- Install the built `.vsix` into a regular VS Code ("Install from VSIX…") and run **Developer: Reload Window**.
- Or open `extensions/skycode` in VS Code and launch an Extension Development Host (F5).

## Tests

```bash
npm run test:unit                    # mocha, extension unit tests
cd webview-ui && npx vitest run      # webview tests
```

## Packaging a .vsix

```bash
npx vsce package --readme-path MARKETPLACE.md
```

`MARKETPLACE.md` is the Marketplace page text; `README.md` in the extension folder is the developer index.

## Release

1. Bump `version` in `extensions/skycode/package.json`.
2. Push the tag `ext-vX.Y.Z` (the tag version must match `package.json`).
3. `.github/workflows/skycode-extension.yml` builds the extension, runs unit tests, publishes to the VS Code Marketplace (repo secret `VSCE_PAT`; trusted publishing via `vsce publish --oidc` is planned once the Marketplace supports it) and attaches the `.vsix` to a GitHub Release. Open VSX is published only if the `OVSX_PAT` secret exists.

A manual workflow run (Actions → Skycode Extension → Run workflow) only builds the `.vsix` into artifacts.

## Type Checking

```bash
npm run check-types
```

## gRPC / Protobuf Communication

The extension and webview communicate via a gRPC-like protocol.

### Proto Files

Location: `proto/skycode/*.proto`

```protobuf
service MyService { }      // PascalCase
rpc myMethod() { }         // camelCase
message MyMessage { }      // PascalCase
```

### After Changing Proto Files

```bash
npm run protos
```

Generates types in:
- `src/shared/proto/`
- `src/generated/grpc-js/`
- `src/generated/nice-grpc/`
- `src/generated/hosts/`

### Adding a New RPC Method

1. Add to the `.proto` file
2. Create a handler in `src/core/controller/<domain>/`
3. Call from webview: `UiServiceClient.myMethod(request)`

## GlobalState

### Adding a New Key

1. Add a field to `GLOBAL_STATE_FIELDS` in `src/shared/storage/state-keys.ts`:
   ```typescript
   const GLOBAL_STATE_FIELDS = {
     myKey: { default: undefined as string | undefined },
   } satisfies FieldDefinitions
   ```

2. Read in `getStateToPostToWebview`:
   ```typescript
   myKey: stateManager.getGlobalStateKey("myKey"),
   ```

3. Use:
   ```typescript
   controller.stateManager.setGlobalState("myKey", value)
   controller.stateManager.getGlobalStateKey("myKey")
   ```

## Adding an API Provider

Three places for proto conversion (otherwise it resets to Anthropic):

1. `proto/skycode/models.proto` — add to `ApiProvider` enum
2. `convertApiProviderToProto()` in `src/shared/proto-conversions/models/api-configuration-conversion.ts`
3. `convertProtoToApiProvider()` in the same file

Additionally:
- `src/shared/api.ts` — union type and models
- `src/shared/providers/providers.json` — for the dropdown
- `src/core/api/index.ts` — handler in `createHandlerForProvider()`
- Webview components

## Regenerating Snapshots

After changing prompts:

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## See Also

- [Adding Tools](./adding-tools.md)
- [Network Requests](./network.md)
- [Adding Settings](./adding-settings.md)
