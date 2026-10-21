> **English version:** [indexing-system.md](../en/systems/indexing-system.md)

# Поиск по коду и индексация

Страница описывает два уровня поиска: карту репозитория (работает всегда) и необязательный векторный индекс. Пути относительно `extensions/skycode/src/`.

## Поиск без индекса

Инструмент `codebase_search` по умолчанию ищет без индекса и без скачивания моделей:

1. **Карта репозитория** (`services/repo-map/`). Список объявлений проекта (классы, методы, функции, процедуры и таблицы SQL) с файлом и строкой. Файлы перечисляет `rg --files` (уважает `.gitignore`), объявления извлекает tree-sitter. Кэш лежит в `~/.skycode/repo-map/<хеш>.json`, при повторном запуске разбираются только изменившиеся файлы.
2. **Текстовый поиск ripgrep** по словам запроса. Файлы ранжируются по числу разных слов запроса, которые в них встречаются. Ищутся и комментарии, и строки.

Обработчик: `core/task/tools/handlers/CodebaseSearchToolHandler.ts`, поиск без индекса: `services/repo-map/searchWithoutIndex.ts`. Краткий обзор проекта из карты также добавляется в первое сообщение задачи.

## Векторный индекс

Индекс необязателен и по умолчанию **выключен** (`skycode.indexing.mode = "off"`). Если он включён и готов, `codebase_search` использует его вместе с ключевым поиском.

| Режим | Что делает | Доступность |
|---|---|---|
| `off` | Индекса нет | По умолчанию |
| `remote` | Эмбеддинги считает OpenAI-совместимый API (`/v1/embeddings`) | Работает в сборке из Marketplace |
| `local` | Эмбеддинги считает локальная модель в отдельном потоке (transformers.js, onnxruntime) | В сборке из Marketplace недоступен: модели и `onnxruntime-node` в VSIX не входят |

В режиме `remote` фрагменты кода отправляются на указанный адрес. Режим `remote` подходит для любого сервера с совместимым API (OpenAI, vLLM, HuggingFace TEI и др.).

### Настройки

| Настройка | Тип | По умолчанию | Описание |
|---|---|---|---|
| `skycode.indexing.mode` | `"off" \| "local" \| "remote"` | `"off"` | Режим |
| `skycode.indexing.remoteApiUrl` | string | `""` | Адрес embeddings API |
| `skycode.indexing.remoteApiKey` | string | `""` | Ключ API |
| `skycode.indexing.remoteModel` | string | `"text-embedding-3-small"` | Модель эмбеддингов |
| `skycode.indexing.localModel` | `"mini" \| "base" \| "large"` | `"mini"` | Локальная модель (только режим `local`) |
| `skycode.indexing.maxFileSize` | number | `102400` | Максимальный размер файла в байтах |
| `skycode.indexing.ignoredPatterns` | string[] | `node_modules`, `.git`, `dist` и др. | Что не индексировать |

Настройки доступны также во вкладке «Индексация» в настройках Skycode.

Локальные модели: `mini` (`paraphrase-multilingual-MiniLM-L12-v2`, размерность 384), `base` (`multilingual-e5-base`, 768), `large` (`multilingual-e5-large`, 1024). Если файлов модели нет рядом с расширением, воркер скачивает архив из хранилища проекта.

## Устройство

```
IndexingService — core/indexing/IndexingService.ts
├── FileWalker          обход файлов: .gitignore, ignoredPatterns, maxFileSize, бинарные файлы
├── CodeChunker         разбиение на чанки (tree-sitter, запасной вариант без него)
├── EmbeddingRouter     выбор провайдера
│   ├── EmbeddingWorkerManager   локальная модель, отдельный поток
│   └── RemoteEmbeddingProvider  OpenAI-совместимый API, до 100 текстов за запрос
├── IndexStorage        хранилище индекса
│   └── VectorSearch, KeywordSearch
└── SearchEngine        гибридный поиск и оформление результата
```

**Хранилище.** `~/.skycode/indexing/<хеш рабочей области>/`. Основной вариант: `index.db` (встроенный `node:sqlite`). Если `node:sqlite` недоступен в среде выполнения VS Code, используется запасной вариант: файлы `index.json`, `chunks.json` и `vectors.bin`. Он медленнее на больших репозиториях.

**Пайплайн.**

1. `FileWalker` обходит рабочую область.
2. `CodeChunker` режет файлы на чанки.
3. Чанки пачками по 16 отправляются на эмбеддинг.
4. Результат сохраняется в хранилище.
5. `FileSystemWatcher` отслеживает изменения. События группируются (700 мс), изменившийся файл перечанкуется. Изменение определяется по MD5 содержимого. Удалённый файл убирается из индекса.

**Поиск.** `SearchEngine` объединяет семантический поиск (`VectorSearch`), поиск по ключевым словам и по путям, затем переранжирует результаты (`Reranker`). Для запросов не на латинице вес семантического поиска выше. Если эмбеддинг не удался, поиск переходит на ключевые слова. Ответ инструмента оформлен блоком `<codebase_context>`.

## Команды

| Команда | Что делает |
|---|---|
| `skycode.indexing.reindex` | Полная переиндексация |
| `skycode.indexing.clear` | Очистить индекс |
| `skycode.indexing.pause` | Приостановить |
| `skycode.indexing.resume` | Продолжить |
| `skycode.indexing.clearEmbeddingCache` | Удалить локальные файлы модели эмбеддингов |

## Добавление провайдера эмбеддингов

1. Реализовать `EmbeddingProvider` из `core/indexing/types.ts`.
2. Добавить ветку в `EmbeddingRouter.ts`.
3. Добавить значение в `skycode.indexing.mode` в `package.json`.
4. Добавить интерфейс в `webview-ui/src/components/settings/sections/IndexingSettingsSection.tsx`.
