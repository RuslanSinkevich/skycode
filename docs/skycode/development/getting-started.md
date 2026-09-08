> **Русская версия:** [getting-started.md](../ru/development/getting-started.md)

# Development Guide

## Prerequisites

- Node.js — the exact version in `vscode/.nvmrc` (24.18.0 as of upstream 1.136.1).
  `build/npm/preinstall.ts` enforces it and refuses to install on an older one.
- Python 3.x (for VS Code native module builds)
- C++ build tools (Visual Studio Build Tools on Windows)
- Git, with Git LFS installed

## Quick Start

```bash
# Clone
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/vscode

# Install dependencies (Windows: see the toolset note below first)
npm install

# Launch in development mode
# Windows:
.scriptscode.bat
# macOS/Linux:
./scripts/code.sh
```

## Windows: pin the MSVC toolset

Every command that builds native modules must run with `VCToolsVersion` pinned:

```bash
VCToolsVersion=14.41.34120 npm ci
```

Electron 42 (upstream 1.123.2 and later) requires Spectre-mitigated MSVC libraries. Those
are an optional Visual Studio component and are usually installed for **one** toolset
only, while MSBuild defaults to the newest one it finds — so the build dies with
`MSB8040: this project requires the Spectre-mitigated libraries`.

Check which toolsets actually have them:

```bash
ls "/c/Program Files/Microsoft Visual Studio/"*/*/VC/Tools/MSVC/*/lib/spectre
```

Pin `VCToolsVersion` to a version that appears in that listing. Installing the Spectre
libs for the newest toolset through the Visual Studio Installer works too, but is a
multi-gigabyte download. The pin does not persist between shells — put it in the same
command, every time.

## Reinstalling dependencies after an upstream merge

`npm ci` only cleans the **root** `node_modules`. Every folder under `extensions/` keeps
its own tree, so after an upstream version bump they are left holding stale packages —
typically an old `@types/node`, which makes `npm run compile` fail in files the merge
never touched.

Refresh them with:

```bash
VSCODE_FORCE_INSTALL=1 npm_command=install VCToolsVersion=14.41.34120 node build/npm/postinstall.ts
```

Both environment variables are load-bearing:

- `npm_command=install` — `build/npm/postinstall.ts` takes its subcommand from
  `process.env['npm_command']`. Running it as `npm run postinstall` sets that variable to
  `run-script`, so the script runs `npm run-script` in each folder, which merely prints the
  available scripts. It exits 0 having installed nothing. Invoking the file through `node`
  directly is what lets an explicit value survive.
- `VSCODE_FORCE_INSTALL=1` — bypasses the up-to-date cache in
  `node_modules/.postinstall-state`. An interrupted run can leave that cache claiming
  everything is current.

Verify afterwards that a sample extension matches its lockfile:

```bash
node -e "console.log(require('./extensions/git/node_modules/@types/node/package.json').version)"
```

## Building the Full Distribution

```bash
VCToolsVersion=14.41.34120 npm run gulp vscode-win32-x64
```

Output goes to `../VSCode-win32-x64` (`Skycode.exe`, not `code.exe`). The task begins by
deleting that folder, so rename any build you still want before starting.

## Building the Extension

```bash
# Build the webview UI
cd vscode/extensions/skycode/webview-ui
npm run build

# Build the extension backend
cd ..
node esbuild.mjs
```

## Type Checking

```bash
npm run compile
# or
npx tsc --noEmit
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

## Changesets

For significant user-facing changes:

```bash
npm run changeset
```

Create **patch** versions only. Skip for minor fixes, internal refactors, and invisible UI changes.

## Regenerating Snapshots

After changing prompts:

```bash
UPDATE_SNAPSHOTS=true npm run test:unit
```

## See Also

- [Adding Tools](./adding-tools.md)
- [Network Requests](./network.md)
- [Adding Settings](./adding-settings.md)
- [Fork Patches](./fork-patches.md)
