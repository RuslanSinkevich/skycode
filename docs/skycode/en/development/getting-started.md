> **Русская версия:** [getting-started.md](../../development/getting-started.md)

# Development Guide

Skycode is a VS Code extension; its code is in `extensions/skycode/`. The repository is physically still a fork of VS Code, but you do not need to build VS Code itself (`npm install` in the root, gulp, `scripts/code.*`) for Skycode. All commands below run from `extensions/skycode`. Paths in the text are relative to that folder unless stated otherwise.

## Requirements

- VS Code 1.90 or newer (the minimum engine version in `package.json`).
- Node.js 22 or newer (what CI builds with) and npm.

## Quick start

```bash
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/extensions/skycode

npm ci
cd webview-ui && npm ci && cd ..

npm run protos     # types from proto/skycode/*.proto
npm run package    # types + webview build + lint + production bundle
```

Generated code (`src/shared/proto/`, `src/generated/`, `webview-ui/src/services/grpc-client.ts`) is not stored in git. Run `npm run protos` after cloning and after any `.proto` change.

For development: `npm run dev` (protos and watch for esbuild and tsc), `npm run dev:webview` (Vite dev server for the webview), `node esbuild.mjs` (extension bundle only).

## Running and trying

- Build a package (`npm run package:vsix`, result `dist/skycode.vsix`), install it with "Install from VSIX…", and run **Developer: Reload Window**.
- Or open `extensions/skycode` in VS Code and start the "Run Extension (local)" configuration from `.vscode/launch.json` (F5).

## Checks

| What | Command |
|---|---|
| Extension types | `npx tsc --noEmit -p .` |
| Test types | `npx tsc --noEmit -p tsconfig.test.json` |
| Webview types | `cd webview-ui && npx tsc --noEmit -p tsconfig.app.json` |
| Lint | `npx biome lint --diagnostic-level=error src webview-ui/src` |
| Extension unit tests (mocha) | `npm run test:unit` |
| Webview tests (vitest) | `cd webview-ui && npx vitest run` |
| Update prompt snapshots | `UPDATE_SNAPSHOTS=true npm run test:unit` |

Extension tests use mocha, chai and sinon. Test files live in `__tests__` folders next to the code.

## Packaging and release

```bash
npx vsce package --readme-path MARKETPLACE.md
```

`MARKETPLACE.md` is the text of the Marketplace page. `README.md` in the extension folder is an index for developers.

Release:

1. Raise `version` in `extensions/skycode/package.json`.
2. Push the tag `ext-vX.Y.Z` (the version in the tag must equal `package.json`).
3. The workflow `.github/workflows/skycode-extension.yml` builds the extension, runs unit tests, publishes to the VS Code Marketplace (secret `VSCE_PAT`; without it the workflow tries `vsce publish --oidc`, which the Marketplace does not support yet) and attaches the `.vsix` to a GitHub Release. Open VSX is used only if the secret `OVSX_PAT` is set.

A manual run of the workflow (Actions, Skycode Extension, Run workflow) only builds the `.vsix` as an artifact.

## What is not in the .vsix

By `.vscodeignore`, `models/` (embedding models) and `onnxruntime-node` are left out of the package. So the local indexing mode is unavailable in the installed extension. Voice components and the headless browser are downloaded on first use as well.

## gRPC and Protobuf

The extension and the webview talk through messages defined in `proto/skycode/*.proto`.

```protobuf
service MyService { }      // PascalCase
rpc myMethod() { }         // camelCase
message MyMessage { }      // PascalCase
```

Rules:

- do not change or reuse field numbers;
- replace a removed field with `reserved N;`;
- run `npm run protos` after an edit;
- do not run `scripts/generate-state-proto.mjs`.

`npm run lint:proto` (part of `npm run lint`) checks naming style.

### New RPC method

1. Add the method to the `.proto` file.
2. Create a handler in `src/core/controller/<domain>/`.
3. Call it from the webview: `UiServiceClient.myMethod(request)` (the client of the matching service).

## State

Settings and state are described in `src/shared/storage/state-keys.ts`:

- `GLOBAL_STATE_FIELDS`: internal state;
- `USER_SETTINGS_FIELDS`: user settings;
- `API_HANDLER_SETTINGS_FIELDS`: provider parameters;
- secrets (API keys) are stored separately in SecretStorage.

Read and write: `controller.stateManager.getGlobalStateKey("key")`, `getGlobalSettingsKey("key")`, `setGlobalState("key", value)`. The full order of adding a setting: [Adding settings](./adding-settings.md).

## Adding a model provider

Proto conversion exists in three places. If you skip one, the provider choice resets to the default.

1. `proto/skycode/models.proto`: add a value to `enum ApiProvider` (a new number).
2. `convertApiProviderToProto()` in `src/shared/proto-conversions/models/api-configuration-conversion.ts`.
3. `convertProtoToApiProvider()` in the same file.

Also:

- `src/shared/api.ts`: the `ApiProvider` type and models;
- `src/shared/providers/providers.json`: the dropdown list;
- `src/core/api/providers/`: the provider class and a branch in `createHandlerForProvider()` in `src/core/api/index.ts`;
- `webview-ui/src/components/settings/providers/`: the provider settings form.

## See also

- [Adding agent tools](./adding-tools.md)
- [Adding settings](./adding-settings.md)
- [Network requests](./network.md)
