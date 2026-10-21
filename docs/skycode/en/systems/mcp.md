> **Русская версия:** [mcp.md](../../systems/mcp.md)

# Model Context Protocol (MCP)

MCP is a protocol through which the agent gets extra **tools** and **resources** from external servers. A server can be a local program (started as a process) or a remote service over HTTP.

Paths below are relative to `extensions/skycode/src/`.

## Architecture

```
┌────────────┐  gRPC   ┌────────────┐  stdio / SSE / HTTP  ┌────────────┐
│ Webview UI │◄───────►│   McpHub   │◄────────────────────►│ MCP server │
└────────────┘         │(extension) │                      └────────────┘
                       └────────────┘
```

## Key files

| File | Purpose |
|---|---|
| `skycode_mcp_settings.json` | Server configuration. Lives in the `settings/` folder of the extension data |
| `services/mcp/McpHub.ts` | Connections, starting and stopping servers, watching the configuration file |
| `services/mcp/schemas.ts` | Configuration schema (zod) |
| `services/mcp/McpTransportFactory.ts` | Creates the transport: stdio, SSE, Streamable HTTP |
| `services/mcp/McpOAuthManager.ts` | OAuth authorization for remote servers |
| `core/prompts/system-prompt/components/mcp.ts` | System prompt section with the list of servers and tools |
| `core/task/tools/handlers/UseMcpToolHandler.ts` | The `use_mcp_tool` call |
| `core/task/tools/handlers/AccessMcpResourceHandler.ts` | The `access_mcp_resource` call |
| `core/task/tools/handlers/LoadMcpDocumentationHandler.ts` | The `load_mcp_documentation` call |
| `core/controller/mcp/` | Handlers for UI requests: add, delete, restart, toggle, auto-approve, timeout |

## How it works

1. **Configuration.** `McpHub` reads `skycode_mcp_settings.json`, validates it against the schema and watches the file for changes.
2. **Connection.** For each enabled server a transport is created, and the list of tools and resources is requested. For `stdio` a process is started (`command`, `args`, `env`, `cwd`).
3. **System prompt.** If there are servers, a section with their tools is added to the prompt. In Ask and Chat modes the section is hidden and MCP calls are blocked.
4. **Call.** The model calls a tool through `use_mcp_tool` with `server_name`, `tool_name` and `arguments` (JSON). `UseMcpToolHandler` checks approval and calls `McpHub.callTool()`. The result goes back to the model.

```xml
<use_mcp_tool>
  <server_name>my-server</server_name>
  <tool_name>search-docs</tool_name>
  <arguments>{"query": "hooks"}</arguments>
</use_mcp_tool>
```

## Transport types

| Type | `type` in config | Fields | When to use |
|---|---|---|---|
| Local process | `stdio` | `command`, `args`, `env`, `cwd` | Most servers (npx, node, python) |
| Server-Sent Events | `sse` | `url`, `headers` | Older remote servers |
| Streamable HTTP | `streamableHttp` | `url`, `headers` | Newer remote servers |

If an entry has `url` but no `type`, `sse` is used.

## Adding a server

**Through the UI.** Skycode settings, the "MCP" tab. The "Remote servers" («Удаленные серверы») tab takes a name, a URL and the transport type (Streamable HTTP or SSE). The "Configure" («Настроить») tab shows connected servers and an "Edit configuration" button that opens `skycode_mcp_settings.json`. Each server has restart, delete and authenticate buttons.

**By hand.** Edit `skycode_mcp_settings.json`:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "my-mcp-server"],
      "env": { "API_KEY": "your-key-here" },
      "disabled": false,
      "timeout": 60,
      "autoApprove": ["tool-name-1"]
    },
    "remote-server": {
      "type": "streamableHttp",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ..." }
    }
  }
}
```

`timeout` is in seconds (default 60). `disabled: true` turns a server off without deleting the entry.

## Approving calls

An MCP tool call runs without a prompt only when both are true:

- MCP auto-approval is on in the "Permissions" settings (`useMcp`, on by default);
- auto-approve is on for that particular tool (`autoApprove` in the configuration, or the toggle next to the tool in the UI).

`autoApprove` is empty by default, so every call asks for your approval.
