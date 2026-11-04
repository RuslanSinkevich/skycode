# Управление контекстом (Context Management)

Как Skycode справляется с ростом истории чата: когда и как сжимается контекст.

## Проблема

Каждый промпт, ответ модели и результат инструмента копятся в `apiConversationHistory`. У моделей ограниченное окно, при переполнении запрос падает с ошибкой, а длинный контекст дорог и ухудшает качество.

## Ключевые файлы

| Файл | Назначение |
|---|---|
| `src/core/context/context-management/ContextManager.ts` | Проверка порога (`shouldCompactContextWindow`), оптимизация чтения файлов, диапазон обрезки |
| `src/core/context/context-management/context-window-utils.ts` | `contextWindow`, `maxAllowedSize`, порог автосжатия в токенах |
| `src/core/context/context-management/FileReadOptimizer.ts` | Замена повторных чтений одного файла заглушкой |
| `src/core/context/context-management/contextBreakdown.ts` | Разбивка контекста по категориям для окошка кольца контекста |
| `src/core/context/context-management/context-error-handling.ts` | Распознавание ошибок переполнения контекста от провайдеров |
| `src/core/prompts/contextManagement.ts` | Промпт `summarizeTask` |
| `src/core/task/tools/handlers/SummarizeTaskHandler.ts` | Обработчик `summarize_task` |
| `src/core/task/index.ts` | Решение о сжатии (`recursivelyMakeSkycodeRequests`), обработка переполнения (`handleContextWindowExceededError`) |
| `src/shared/storage/state-keys.ts` | Настройки `useAutoCondense` (по умолчанию `true`), `autoCondenseThreshold` (по умолчанию `0.75`) |

## Авто-сжатие (суммаризация)

Работает при `useAutoCondense = true`. Перед каждым запросом к модели:

1. `shouldCompactContextWindow()` сравнивает токены предыдущего запроса с порогом `min(contextWindow * autoCondenseThreshold, maxAllowedSize)`.
2. Если порог превышен, сначала пробуется оптимизация чтений файлов (`attemptFileReadOptimization`); хватило её — сжатия нет.
3. Иначе к сообщению добавляется промпт `summarizeTask`, и модель отвечает инструментом `summarize_task` со структурированным отчётом (задача, решения, изменённые файлы, нерешённое, список Required Files).
4. `SummarizeTaskHandler` скрывает старую историю, вставляет отчёт как продолжение и перечитывает файлы из Required Files (не больше 8 файлов и 100 000 символов).

Дополнительно для слабых и средних моделей включено принудительное сжатие каждые N запросов (лимиты по уровню модели, `MODEL_SESSION_LIMITS` в `src/shared/prompts.ts`, режим — настройка `sessionBudgetMode`); оно срабатывает, только если контекст заполнен не меньше чем наполовину от порога.

Ручное сжатие — слэш-команда `/compact` (кнопка «Сжать сессию» в окошке кольца контекста).

### `maxAllowedSize`

Для сильных моделей зависит от окна: 64k → окно − 27k, 128k → окно − 30k, 200k → окно − 40k, иначе `max(окно − 40k, окно * 0.8)`. Для слабых и средних — `окно * contextWindowUsageRatio` из `MODEL_SESSION_LIMITS`.

## Обрезка истории

Если запрос всё же упал с ошибкой переполнения (`checkContextWindowExceededError`), `handleContextWindowExceededError()` обрезает историю: `ContextManager.getNextTruncationRange` удаляет сообщения из середины, сохраняя первую пару и последние сообщения, а перед этим выполняется хук PreCompact (если хуки включены).

## Интерфейс

- Кольцо заполненности контекста рядом с названием модели (`webview-ui/src/components/chat/context-ring/ContextRing.tsx`). Клик открывает окошко: размер контекста, разбивка по категориям, остаток до автосжатия, «Сжать сессию».
- Включение авто-сжатия — в настройках, вкладка «Контекст» (`ContextSection.tsx`).

## См. также

- [OVERVIEW.md](./OVERVIEW.md) — общая архитектура
- [CORE.md](./CORE.md) — core модуль
- [../ADDING_SETTINGS.md](../ADDING_SETTINGS.md) — как добавить настройку
