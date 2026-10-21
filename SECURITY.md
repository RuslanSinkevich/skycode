# Политика безопасности / Security policy

Русский текст идёт первым, английский ниже.

## Как сообщить об уязвимости

Не создавайте публичный issue для уязвимости. Используйте один из каналов:

1. Приватное сообщение об уязвимости на GitHub: вкладка Security репозитория [RuslanSinkevich/skycode](https://github.com/RuslanSinkevich/skycode), кнопка «Report a vulnerability».
2. Если GitHub недоступен: напишите автору в Telegram, [@ruslansinkevich](https://t.me/ruslansinkevich).

В сообщении укажите версию Skycode (в списке расширений VS Code), версию VS Code, ОС, шаги воспроизведения и что, по вашему мнению, может сделать атакующий. Если можно, приложите минимальный пример.

Исправления выходят в обычных релизах расширения (теги `ext-vX.Y.Z`). Поддерживается последняя опубликованная версия.

## Что и куда отправляет Skycode

Skycode работает внутри VS Code на вашей машине. Своего сервера у проекта нет.

- **Модель.** Текст запросов, содержимое файлов, которые читает агент, и вывод команд отправляются только тому провайдеру, которого вы настроили (ваш шлюз, локальная модель или облачный API). Другим адресатам эти данные не уходят.
- **Телеметрия.** Нет. В коде расширения нет отправки статистики, отчётов об ошибках или данных об использовании. Аккаунтов нет.
- **Ключи API.** Хранятся в хранилище секретов VS Code (SecretStorage) на вашей машине.
- **История задач** хранится локально в папке данных расширения VS Code. Векторный индекс (если включён) и кэш карты репозитория лежат в `~/.skycode/`.
- **Голосовой ввод.** Звук не покидает компьютер. Распознавание идёт локально (GigaAM v3 на sherpa-onnx для русского, whisper.cpp для остальных языков). Нужна разовая загрузка компонентов, см. ниже.
- **Индексация кода.** По умолчанию выключена. В режиме `remote` фрагменты кода отправляются на embeddings API, который вы указали. Режим `local` считает эмбеддинги на вашей машине, но в сборке из Marketplace недоступен.

### Что ещё обращается в сеть

Эти обращения идут не к модели, а по вашему действию или при первом использовании функции.

- **MCP-серверы.** Skycode подключается к серверам из вашей конфигурации. Что они делают с данными, определяет сам сервер. По умолчанию вызов инструмента MCP требует вашего подтверждения.
- **Веб-инструменты** (`web_search`, `web_fetch`). Включаются во вкладке настроек «Веб», по умолчанию выключены. Поиск использует `html.duckduckgo.com`. Загрузка страниц идёт на адреса, которые запросил агент.
- **Голос, GigaAM** (около 230 МБ): файлы модели с `huggingface.co` (закреплённая ревизия, проверка sha256), запасной вариант — архив с `github.com`; среда выполнения sherpa-onnx с `registry.npmjs.org` (проверка контрольной суммы); ffmpeg с `github.com`, если в системе его нет. Загрузка повторяется до трёх раз при обрыве.
- **Голос, whisper.cpp** и другие компоненты (модели индексации, headless-браузер для инструмента браузера): скачиваются с хранилища проекта `storage.yandexcloud.net/skycode-releases`.

### Рекомендации

- Для закрытых сетей используйте провайдера внутри сети. Загрузки компонентов идут только из источников, перечисленных выше.
- Не включайте автоматическое выполнение всех команд (вкладка «Разрешения»), если не доверяете модели.
- Не храните секреты в файлах проекта, которые агент может прочитать. Файл `.skycodeignore` закрывает файлы от агента.

---

## How to report a vulnerability

Do not open a public issue for a vulnerability. Use one of these channels:

1. GitHub private vulnerability reporting: the Security tab of [RuslanSinkevich/skycode](https://github.com/RuslanSinkevich/skycode), "Report a vulnerability".
2. If GitHub is not available, message the author on Telegram, [@ruslansinkevich](https://t.me/ruslansinkevich).

Include the Skycode version (shown in the VS Code extensions list), the VS Code version, your OS, reproduction steps, and what you think an attacker could do. A minimal example helps.

Fixes ship in normal extension releases (tags `ext-vX.Y.Z`). The latest published version is supported.

## What Skycode sends and where

Skycode runs inside VS Code on your machine. The project has no server of its own.

- **Model.** Prompt text, the content of files the agent reads, and command output go only to the provider you configured (your gateway, a local model, or a cloud API). Nobody else receives this data.
- **Telemetry.** None. The extension code does not send statistics, crash reports or usage data. There are no accounts.
- **API keys.** Stored in the VS Code secret storage (SecretStorage) on your machine.
- **Task history** is stored locally in the extension data folder of VS Code. The vector index (if enabled) and the repository map cache are in `~/.skycode/`.
- **Voice input.** Audio does not leave your computer. Recognition is local (GigaAM v3 on sherpa-onnx for Russian, whisper.cpp for other languages). A one-time component download is required, see below.
- **Code indexing.** Off by default. In `remote` mode, code fragments are sent to the embeddings API you specified. The `local` mode computes embeddings on your machine but is unavailable in the Marketplace build.

### Other network access

These requests do not go to the model. They happen on your action or on first use of a feature.

- **MCP servers.** Skycode connects to the servers in your configuration. What a server does with data is up to the server. By default an MCP tool call needs your approval.
- **Web tools** (`web_search`, `web_fetch`). Enabled in the "Web" settings tab, off by default. Search uses `html.duckduckgo.com`. Page fetching goes to the addresses the agent asked for.
- **Voice, GigaAM** (about 230 MB): model files from `huggingface.co` (pinned revision, sha256 checked), with a fallback archive from `github.com`; the sherpa-onnx runtime from `registry.npmjs.org` (checksum verified); ffmpeg from `github.com` if the system has none. Downloads retry up to three times on connection errors.
- **Voice, whisper.cpp** and other components (indexing models, the headless browser for the browser tool): downloaded from the project storage `storage.yandexcloud.net/skycode-releases`.

### Recommendations

- In closed networks use a provider inside the network. Component downloads come only from the sources listed above.
- Do not enable automatic execution of all commands (the "Permissions" tab) unless you trust the model.
- Do not keep secrets in project files the agent can read. A `.skycodeignore` file hides files from the agent.
