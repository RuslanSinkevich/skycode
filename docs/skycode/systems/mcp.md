> **English version:** [mcp.md](../en/systems/mcp.md)

# Model Context Protocol (MCP)

MCP — протокол, через который агент получает дополнительные **инструменты** и **ресурсы** от внешних серверов. Сервер может быть локальной программой (запускается как процесс) или удалённой службой по HTTP.

Пути ниже относительно `extensions/skycode/src/`.

## Архитектура

```
┌────────────┐  gRPC   ┌────────────┐  stdio / SSE / HTTP  ┌────────────┐
│ Webview UI │◄───────►│   McpHub   │◄────────────────────►│ MCP-сервер │
└────────────┘         │(расширение)│                      └────────────┘
                       └────────────┘
```

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `skycode_mcp_settings.json` | Конфигурация серверов. Лежит в папке `settings/` данных расширения |
| `services/mcp/McpHub.ts` | Подключения, запуск и остановка серверов, наблюдение за файлом конфигурации |
| `services/mcp/schemas.ts` | Схема конфигурации (zod) |
| `services/mcp/McpTransportFactory.ts` | Создание транспорта: stdio, SSE, Streamable HTTP |
| `services/mcp/McpOAuthManager.ts` | OAuth-авторизация удалённых серверов |
| `core/prompts/system-prompt/components/mcp.ts` | Раздел системного промпта со списком серверов и инструментов |
| `core/task/tools/handlers/UseMcpToolHandler.ts` | Вызов `use_mcp_tool` |
| `core/task/tools/handlers/AccessMcpResourceHandler.ts` | Вызов `access_mcp_resource` |
| `core/task/tools/handlers/LoadMcpDocumentationHandler.ts` | Вызов `load_mcp_documentation` |
| `core/controller/mcp/` | Обработчики запросов из интерфейса: добавить, удалить, перезапустить, включить, автоподтверждение, таймаут |

## Как это работает

1. **Конфигурация.** `McpHub` читает `skycode_mcp_settings.json`, проверяет его схемой и следит за изменениями файла.
2. **Подключение.** Для каждого включённого сервера создаётся транспорт и запрашиваются список инструментов и ресурсов. Для `stdio` запускается процесс (`command`, `args`, `env`, `cwd`).
3. **Системный промпт.** Если серверы есть, в промпт добавляется раздел с их инструментами. В режимах «Вопрос» и «Чат» этот раздел скрыт, а вызовы MCP заблокированы.
4. **Вызов.** Модель вызывает инструмент через `use_mcp_tool` с полями `server_name`, `tool_name` и `arguments` (JSON). `UseMcpToolHandler` проверяет подтверждение и вызывает `McpHub.callTool()`. Результат возвращается модели.

```xml
<use_mcp_tool>
  <server_name>my-server</server_name>
  <tool_name>search-docs</tool_name>
  <arguments>{"query": "hooks"}</arguments>
</use_mcp_tool>
```

## Типы транспорта

| Тип | `type` в конфигурации | Поля | Когда использовать |
|---|---|---|---|
| Локальный процесс | `stdio` | `command`, `args`, `env`, `cwd` | Большинство серверов (npx, node, python) |
| Server-Sent Events | `sse` | `url`, `headers` | Удалённые серверы старого типа |
| Streamable HTTP | `streamableHttp` | `url`, `headers` | Удалённые серверы нового типа |

Если у записи есть `url`, но нет `type`, используется `sse`.

## Добавление сервера

**Через интерфейс.** Настройки Skycode, вкладка «MCP». Вкладка «Удаленные серверы» принимает имя, адрес и тип транспорта (Streamable HTTP или SSE). Вкладка «Настроить» показывает подключённые серверы и кнопку «Изменить конфигурацию», которая открывает файл `skycode_mcp_settings.json`. У сервера есть кнопки перезапуска, удаления и аутентификации.

**Вручную.** Правка `skycode_mcp_settings.json`:

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

`timeout` задаётся в секундах (по умолчанию 60). `disabled: true` отключает сервер, не удаляя запись.

## Подтверждение вызовов

Вызов инструмента MCP выполняется без вопроса только если одновременно:

- в настройках «Разрешения» включено автоподтверждение MCP (`useMcp`, по умолчанию включено);
- для этого инструмента включено автоподтверждение (`autoApprove` в конфигурации или переключатель у инструмента в интерфейсе).

По умолчанию `autoApprove` пуст, поэтому каждый вызов требует вашего подтверждения.
