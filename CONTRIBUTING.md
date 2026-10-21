# Contributing to Skycode

Skycode is the VS Code extension "Skycode AI" (`skycode.skycode-ai`). All its code is in `extensions/skycode/`. The rest of this repository is a fork of VS Code. You do not need to build VS Code to work on Skycode.

## Setup

You need Node.js 22 or newer (the version CI uses) and npm. To try your changes you need VS Code 1.90 or newer.

```bash
git clone https://github.com/RuslanSinkevich/skycode.git
cd skycode/extensions/skycode

npm ci
cd webview-ui && npm ci && cd ..

npm run protos     # generate TypeScript from proto/skycode/*.proto
npm run package    # types + webview build + lint + production bundle
```

Generated code (`src/shared/proto/`, `src/generated/`, `webview-ui/src/services/grpc-client.ts`) is not stored in git. Run `npm run protos` after cloning and after any change to a `.proto` file.

For iteration: `node esbuild.mjs` (extension bundle only), `npm run watch` (esbuild and tsc in watch mode), `npm run dev:webview` (Vite dev server for the webview).

## Try your change

1. Build a package: `npm run package:vsix` (result: `dist/skycode.vsix`), or `npx vsce package --readme-path MARKETPLACE.md`.
2. In VS Code: Extensions view, `…` menu, "Install from VSIX…".
3. Run "Developer: Reload Window".

## Checks

Run these from `extensions/skycode` before opening a pull request.

| What | Command |
|---|---|
| Extension types | `npx tsc --noEmit -p .` |
| Test types | `npx tsc --noEmit -p tsconfig.test.json` |
| Webview types | `cd webview-ui && npx tsc --noEmit -p tsconfig.app.json` |
| Lint | `npx biome lint --diagnostic-level=error src webview-ui/src` |
| Unit tests (mocha) | `npm run test:unit` |
| Webview tests (vitest) | `cd webview-ui && npx vitest run` |
| Update prompt snapshots | `UPDATE_SNAPSHOTS=true npm run test:unit` |

CI runs the build and unit tests on release tags only, so run them yourself.

## Code rules

- TypeScript. Formatting and lint are handled by Biome (`npm run format:fix` formats changed files).
- Network requests: use `fetch` from `@/shared/net` and `getAxiosSettings()` for axios, not the global `fetch`. Otherwise proxy settings are ignored. See [Network requests and proxy](./docs/skycode/en/development/network.md).
- Do not describe or add features without checking them in code. Documentation must match what the product does now.
- User-visible strings go through the i18n files (`webview-ui/src/i18n/locales/` for the webview, `src/i18n/` for the extension side). Russian is the primary language.

## Protobuf rules

The extension and the webview talk through gRPC-style messages defined in `proto/skycode/*.proto`.

- Never renumber or reuse a field number.
- A removed field becomes `reserved N;` with a comment.
- Run `npm run protos` after every `.proto` edit.
- Do not run `scripts/generate-state-proto.mjs`.

## Documentation

Developer documentation is in `docs/skycode/`. Russian pages are primary; English mirrors are in `docs/skycode/en/`. Keep each pair in sync and keep the language link on the first line. Guides for common tasks:

- [Development guide](./docs/skycode/en/development/getting-started.md)
- [Adding agent tools](./docs/skycode/en/development/adding-tools.md)
- [Adding settings](./docs/skycode/en/development/adding-settings.md)

## Pull requests

1. Open an issue first for large changes, so we can agree on the approach.
2. Keep a pull request to one topic.
3. Fill in the pull request template: what changed, why, and which checks you ran.
4. Add or update tests when you change behavior.

## Release (maintainers)

1. Raise `version` in `extensions/skycode/package.json`.
2. Push the tag `ext-vX.Y.Z`. The version in the tag must equal the version in `package.json`.
3. The workflow `.github/workflows/skycode-extension.yml` installs dependencies, builds, runs unit tests, packages the `.vsix`, publishes it to the Visual Studio Marketplace and attaches it to a GitHub Release. The secret `VSCE_PAT` holds the publishing token. Without it the workflow tries `vsce publish --oidc`, which the Marketplace does not support yet. Open VSX is used only if the secret `OVSX_PAT` is set.
4. A manual run of the workflow (Actions, "Skycode Extension", Run workflow) only builds the `.vsix` as an artifact.

## Reporting bugs and security issues

Use the issue templates for bugs and ideas. For vulnerabilities, follow [SECURITY.md](./SECURITY.md) and do not open a public issue.

## License

By contributing you agree that your contribution is licensed under the [Apache License 2.0](./LICENSE).
