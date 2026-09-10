# Терминал и выполнение команд

Как агент запускает shell-команды, почему он никогда не «висит» на долгой
команде и как устроены фоновые команды.

## Два режима

Настройка `terminalExecutionMode` (Settings → Terminal), по умолчанию `vscodeTerminal`.

| | `vscodeTerminal` (по умолчанию) | `backgroundExec` |
|---|---|---|
| Где выполняется | видимый терминал VS Code, shell integration | `child_process`, скрытый терминал |
| Менеджер | `VscodeTerminalManager` | `StandaloneTerminalManager` |
| Пользователь видит процесс | да, в панели терминала | нет, только вывод в чате |

Команды субагентов (`skycode "prompt"`) всегда идут через `StandaloneTerminalManager`,
чтобы не засорять терминал пользователя.

## Путь команды

```
ExecuteCommandToolHandler        // валидация, permissions, approval, PreToolUse hook
  └─ Task.executeCommandTool
       └─ CommandExecutor.execute        // выбор менеджера + resolveCommandTiming
            └─ orchestrateCommandExecution   // общая логика для обоих режимов
```

Проверки до запуска, в этом порядке:

1. `SKYCODE_COMMAND_PERMISSIONS` — `CommandPermissionController`;
2. `.skycodeignore` — `SkycodeIgnoreController.validateCommand`;
3. авто-подтверждение: YOLO → всё, `executeAllCommands` → всё,
   `executeSafeCommands` → только команды, которые `CommandSafetyClassifier`
   считает read-only. Иначе — обычный `ask("command")`.

## Тайминги

Решение принимает `resolveCommandTiming` (`integrations/terminal/constants.ts`) —
это единственное место, где выбирается, сколько команда может блокировать агента.

| Модель передала `timeout` | Режим | Жёсткий таймаут | Soft auto-proceed |
|---|---|---|---|
| да (`timeout=600`) | любой | 600 с | выключен |
| нет | `vscodeTerminal` | 120 с | 20 с |
| нет | `backgroundExec` | 120 с | — |

Явный `timeout` от модели **отключает** auto-proceed: иначе сборка с
`timeout=600` всё равно возвращала бы «ещё работает» через 20 секунд.

По истечении любого из таймаутов агент не блокируется: команда продолжает
работать, а в результате инструмента приходит её `id`. Стрим вывода в чат при
этом прекращается — дальше вывод пишет фоновый трекер в лог-файл.

## Фоновые команды

При уходе в фон менеджер регистрирует `BackgroundCommand`:

- `id` вида `background-<ts>-<rand>`;
- лог-файл во временной папке (`SkycodeTempManager`), туда же дописывается
  вывод, накопленный до перехода в фон;
- жёсткий kill через `BACKGROUND_COMMAND_TIMEOUT_MS` (10 минут), чтобы не
  плодить зомби-процессы.

Агент видит их двумя способами:

- секция `# Background Commands` в environment details — список
  `id / команда / статус / время` на каждом шаге;
- инструмент `check_background_command` — статус, код возврата и последние
  строки вывода конкретного `id` (без `id` — список всех).

Пользователь останавливает всё кнопкой Cancel: `cancelBackgroundCommand`
убивает и фоновые команды, и текущий foreground-процесс.

## Большой вывод

- буферизация в чат: 20 строк / 2 КБ / 100 мс (`CHUNK_*`);
- после 1000 строк или 512 КБ вывод уходит в файл, модели отдаются первые и
  последние 100 строк плюс путь к логу;
- в результат инструмента попадает не больше
  `DEFAULT_TERMINAL_OUTPUT_LINE_LIMIT` строк (2000 для субагентов).

## Файлы

| Файл | Ответственность |
|---|---|
| `integrations/terminal/constants.ts` | тайминги, лимиты, `resolveCommandTiming` |
| `integrations/terminal/CommandExecutor.ts` | выбор менеджера, отмена, фоновые команды |
| `integrations/terminal/CommandOrchestrator.ts` | буферизация, таймауты, формат результата |
| `hosts/vscode/terminal/VscodeTerminalManager.ts` | терминалы VS Code + трекинг фоновых |
| `integrations/terminal/standalone/` | скрытые терминалы на `child_process` |
| `core/task/tools/handlers/ExecuteCommandToolHandler.ts` | approval flow инструмента |
| `core/task/tools/handlers/CheckBackgroundCommandHandler.ts` | `check_background_command` |

## Грабли

- Инструмент, которого нет в `.tools(...)` конкретного варианта промпта, модель
  **не видит** — ни в текстовом режиме, ни в native tool calls. Именно так
  `check_background_command` пролежал невидимым с сентября 2026.
- `say("tool", …)` без ветки в `webview-ui/.../ToolRow.tsx` рисуется как
  `InvisibleSpacer`, то есть пользователь не видит ничего.
- `npm run test:unit` (mocha) собирает только `src/**/__tests__/*.ts`. Тесты
  рядом с кодом (`*.test.ts` вне `__tests__/`) запускаются лишь в
  `npm run test:integration`. Для `VscodeTerminalProcess.test.ts` это
  правильно — ему нужен настоящий API VS Code (`vscode.ThemeIcon`, реальные
  терминалы), а вот тесты `CommandPermissionController` и
  `CommandSafetyClassifier` перенесены в `__tests__/` и теперь идут в юнит-прогоне.

## См. также

- [development/TOOLS.md](./development/TOOLS.md) — добавление инструментов
- [architecture/PROMPTS.md](./architecture/PROMPTS.md) — варианты промптов
