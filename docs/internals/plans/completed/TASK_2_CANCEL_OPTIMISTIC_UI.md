# Task 2: Cancel + optimistic UI [ВЫПОЛНЕНО]

## Статус: ВЫПОЛНЕНО

## Симптомы (были)

A. Зависание кнопки «Отмена» при активном LLM-стриме/команде.
B. Сообщения пользователя не появлялись в чате сразу при отправке во время busy.
C. Терминал не реагировал на cancel.

## Что реализовано

1. **`StreamAborter`** (`src/core/api/utils/abort-support.ts`) — helper для abort через `AbortSignal` + SDK `.controller.abort()`.
2. **Все 44 провайдера** получили `abort(): void` (`ApiHandler.abort` — обязательный метод).
   - OpenAI-совместимые: `{ signal }` в `.create()`, `track(stream)`.
   - Anthropic/Ollama/OpenRouter/Skycode: `currentStream.controller.abort()`.
   - Не-OpenAI: `aborter.abort()` + проверка signal в for-await.
3. **Optimistic UI**: очередь из `useMessageQueue` рендерится как phantom `user_feedback` bubbles в чате (opacity 0.6).

## Что осталось (low priority)

- Единый `AbortController` на уровне `Task` с пробросом в MCP/file IO.
- Оптимизация порядка terminal kill в `abortTask()` (сейчас после hooks).
- Тесты на cancel-пути.

## Метрика готовности

- Cancel во время долгой команды — UI разблокирован сразу.
- 3 сообщения подряд во время стрима — все видны в чате сразу.
