# Skycode AI — Дорожная карта

> Skycode AI — расширение VS Code (Marketplace: `skycode.skycode-ai`).
>
> Обновлено: 2026-10-21 (проверено по коду).

## Выполнено

- **Инструменты агента:** чтение/запись/правка файлов, `apply_patch`, glob, `search_files`, `codebase_search`, `delete_file`, `edit_notebook`, `read_diagnostics`, `web_search`/`web_fetch` (локальные), MCP, `show_visual`, `show_chart`, `read_symbol`, `read_file` с диапазоном строк; защита от обрезанных вызовов инструментов.
- **Режимы:** Act, Plan, Ask, Debug, Chat (у каждой вкладки свой режим).
- **Diff-система V4** (`src/core/diff-v2/`): inline Accept/Reject, снапшоты, откат, навигация по хункам, защита от рассинхрона с git/диском.
- **Inline Edit** (Ctrl+Shift+K) и **Workflow Engine** (YAML-сценарии).
- **Чат:** вкладки сессий (до 3 работающих агентов + очередь), очередь сообщений на вкладку (Enter на пустом поле отправляет верхнее), шторка истории, кольцо контекста с «Сжать сессию», Mermaid-диаграммы, обнаружение зацикливания, умолчания сэмплинга для Qwen.
- **Настройки:** разбиты на вкладки, «Ещё провайдеры», экран «О расширении»; провайдер по умолчанию — OpenAI Compatible; удалены MCP-маркетплейс, онбординг, баннеры, reportbug.
- **Поиск и индексация:** tree-sitter, hybrid search, rerank, SQLite, worker threads. В VSIX нет встроенной embedding-модели и onnxruntime, поэтому локальный режим индексации в собранном расширении недоступен.
- **Голосовой ввод** (0.6.3–0.6.6): GigaAM v3 (sherpa-onnx) с текстом во время речи; модель качается готовыми файлами с Hugging Face, повтор загрузки при обрыве.
- **Пожертвования** через CloudTips (0.6.4); **поддержка VS Code 1.90+** (0.6.5).
- **Чат** (0.6.7): перенос длинных строк в таблицах и коде; детектор длинных коротких петель в рассуждениях.
- **Прочее:** i18n RU/EN, аудит безопасности (SSRF, XSS, Zip Slip).
- **Релиз:** CI по тегу `ext-v*` публикует в Marketplace; VSIX ~9 МБ.

## Открыто

- **Shell Diff Tracking** — [IMPL-16](./implementation/IMPL-16-shell-diff-tracking.md): правки файлов из shell-команд не показываются в diff.
- **Multi-Model System** — [IMPL-17](./implementation/IMPL-17-multi-model-system.md): слоты моделей Primary/Secondary/Utility.
- **Вкладки, этап 5** — [TABS](./TABS.md): автосжатие иногда срабатывает раньше порога (~80%).
- **Тесты** — [TESTING_PLAN](./TESTING_PLAN.md): нет тестов `deleteFromMessage` и `retryFromMessage`.
- **Undo/Redo для Accept/Reject** в diff: архитектурно сложно.
- **Грант Фонда Бортника** — [заявка](./grant-fasie-start-ai.md): черновик, актуальность не определена.

## Выполненные планы

См. [completed/](./completed/) и [implementation/completed/](./implementation/completed/).
