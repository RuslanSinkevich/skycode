# Third-Party Notices

Skycode is built upon and inspired by several open-source projects.
We gratefully acknowledge their contributions to the developer community.

---

## Cline

- **License:** Apache License 2.0
- **Repository:** https://github.com/cline/cline
- **Usage:** The Skycode AI extension was originally derived from the Cline
  extension architecture. Substantial modifications have been made to the
  agent loop, tool system, prompt engine, diff system, and UI.

## Kilocode

- **License:** Apache License 2.0 / MIT
- **Repository:** https://github.com/Kilo-Org/kilocode
- **Usage:** Portions of the autocomplete and tool handling logic were
  adapted from the Kilocode project. The code has been significantly
  reworked to fit Skycode's architecture.

## Continue

- **License:** Apache License 2.0
- **Repository:** https://github.com/continuedev/continue
- **Usage:** The local embedding pipeline (transformers.js WASM integration)
  and portions of the indexing subsystem were adapted from Continue's
  open-source implementation.

---

## Embedded Third-Party Components

| Component | License | Usage |
|-----------|---------|-------|
| transformers.js (@xenova/transformers) | Apache 2.0 | Local embedding inference (WASM) |
| paraphrase-multilingual-MiniLM-L12-v2 | Apache 2.0 | Multilingual embedding model (ONNX) |
| web-tree-sitter | MIT | Code parsing and AST-aware chunking |
| better-sqlite3 | MIT | Index storage |

---

All original Skycode code is licensed under the Apache License 2.0.
See the [LICENSE](./LICENSE) file for details.
