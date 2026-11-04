# Голосовой ввод (GigaAM v3, sherpa-onnx)

Для русского языка диктовка идёт через GigaAM v3 на sherpa-onnx: текст появляется в поле чата во время речи, распознавание локальное и работает без сети. Для остальных языков остаётся whisper.cpp (`WhisperLocalService`, здесь не описан).

Движок выбирается настройкой `dictationSettings.whisperModel`. Значение `"gigaam"` (`GIGAAM_MODEL_ID`) включает GigaAM, но только вместе с языком `"ru"`: проверка `isGigaAmActive` в `src/shared/DictationSettings.ts`. По умолчанию `whisperModel = "gigaam"`, `dictationLanguage = "ru"`. При смене языка на другой `updateSettings.ts` переключает модель на whisper `tiny`.

## Поток данных

```
микрофон
  → ffmpeg (-f s16le -ac 1 -ar 16000 pipe:1)          AudioRecordingService.startStreamingRecording
  → Pcm16ToFloat32                                     sherpa/pcm.ts
  → worker_thread: VAD + GigaAM                        workers/sherpa-dictation-worker.ts
       └ DictationAssembler (committed / partial)      sherpa/DictationAssembler.ts
  → SherpaDictationService.subscribers
  → gRPC stream subscribeToDictationText
  → VoiceRecorder.tsx → поле ввода (ChatTextArea)
```

Остановка: `stopRecording` → `SherpaDictationService.stop()` → итоговый текст возвращается в поле `final_text` ответа `RecordedAudio`.

## Файлы

| Файл | Назначение |
|---|---|
| `src/services/dictation/SherpaLocalService.ts` | Установка и проверка файлов движка в `globalStorage/voice-sherpa/` |
| `src/services/dictation/SherpaDictationService.ts` | Запись, жизнь воркера, подписчики на текст |
| `src/services/dictation/workers/sherpa-dictation-worker.ts` | Воркер: загрузка модели и VAD, распознавание |
| `src/services/dictation/sherpa/DictationAssembler.ts` | Сборка живого текста из речи, разрезанной VAD |
| `src/services/dictation/sherpa/sherpaDownloads.ts` | Таблица закреплённых загрузок: URL, размеры, хеши |
| `src/services/dictation/sherpa/downloadPinned.ts` | Скачивание с проверкой хеша и повторами |
| `src/services/dictation/sherpa/pcm.ts` | PCM s16le из ffmpeg в Float32 |
| `src/services/dictation/AudioRecordingService.ts` | Запуск ffmpeg; `startStreamingRecording` / `stopStreamingRecording` |
| `src/core/controller/dictation/` | `startRecording`, `stopRecording`, `cancelRecording`, `subscribeToDictationText` |
| `proto/skycode/dictation.proto` | `DictationService`, сообщение `DictationText` |
| `webview-ui/src/components/chat/VoiceRecorder.tsx` | Кнопка микрофона, подписка на живой текст |
| `src/core/controller/state/updateSettings.ts` | Включение, установка и переустановка файлов |
| `esbuild.mjs` | Отдельная сборка воркера в `dist/sherpa-dictation-worker.js` |

Тесты: `src/services/dictation/__tests__/sherpaDictation.test.ts`.

## Что скачивается

В .vsix ничего из этого нет. Всё ставится при первом включении движка (`SherpaLocalService.install`) в `globalStorage/voice-sherpa/`:

- `runtime/node_modules/sherpa-onnx-node` и нативный аддон `sherpa-onnx-<платформа>` (npm-тарболы с registry.npmjs.org, версия `SHERPA_VERSION`);
- `models/gigaam-v3-punct/`: `encoder.int8.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt`;
- `models/silero_vad.onnx`: VAD, режет речь по паузам;
- `ffmpeg/`: только если подходящего ffmpeg нет ни у whisper-сервиса, ни в системе (`findFfmpeg`).

Поддерживаются `win32-x64`, `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`. На остальных платформах `isSupported` возвращает false.

Прогресс показывается общей полосой 0-100. Вес каждой загрузки равен её размеру (`computeProgressWeights`). Повторный вызов `install` во время установки возвращает тот же промис. Кнопка переустановки вызывает `SherpaDictationService.dispose()` (на Windows воркер держит файлы модели открытыми) и `SherpaLocalService.reset()`, который удаляет `runtime/` и `models/`, но не ffmpeg.

### Закреплённые загрузки и повторы

Каждая загрузка описана в `sherpaDownloads.ts` (`PinnedDownload`): URL, размер, алгоритм и ожидаемый хеш. `downloadPinned`:

- пишет во временный файл `.part`, считает хеш потоком и переименовывает файл только при совпадении;
- следует редиректам (до 8), в лог пишет адрес без query;
- считает таймаут по простою (120 с без данных), а не по общему времени;
- при обрыве соединения или таймауте повторяет до 3 попыток с паузой 2 с, 4 с. Несовпадение хеша и HTTP-ошибки не повторяются.

### Почему модель качается файлами с Hugging Face, а не архивом

Исходный способ: архив `.tar.bz2` с GitHub и распаковка системным `tar`. npm-пакет `tar` не умеет bzip2, поэтому на Windows вызывался `%SystemRoot%\System32\tar.exe`. На корпоративных машинах его блокируют (AppLocker, антивирус), и установка падала с ошибкой «Failed to extract the speech model archive».

Теперь основной путь (`GIGAAM_MODEL_FILE_DOWNLOADS`): четыре готовых файла из репозитория `csukuangfj/sherpa-onnx-nemo-transducer-punct-giga-am-v3-russian-2025-12-16` на Hugging Face, закреплённая ревизия, без распаковки. Файлы качаются в `gigaam-v3-punct.files` и переносятся в `gigaam-v3-punct` целиком, поэтому недокачанная модель не остаётся на месте рабочей. Хеши совпадают с хешами файлов из архива.

Запасной путь: если Hugging Face недоступен (прокси, блокировка), `runInstall` пишет предупреждение в лог и качает архив с GitHub (`GIGAAM_MODEL_ARCHIVE`, хеш закреплён), распаковывая из него только нужные четыре файла системным tar.

## Воркер

`SherpaDictationService.ensureWorker` запускает `dist/sherpa-dictation-worker.js` как `worker_threads.Worker`. Распознавание одного куска занимает до 0,5 с, поэтому оно не выполняется в extension host.

Нативный аддон не бандлится. Воркер создаёт `require` от пути `runtime/node_modules/noop.js` и загружает `sherpa-onnx-node` оттуда. Для `init` ждёт сообщение `ready` до 60 с.

Сообщения менеджера воркеру: `init` (пути к рантайму, модели, VAD, число потоков), `reset`, `audio` (Float32Array 16 кГц mono, передаётся через transfer), `finish`. Ответы: `ready`, `update` (`committed`, `partial`), `final`, `error`.

Модель: `OfflineRecognizer` с `modelType: "nemo_transducer"`, признаки 64, 4 потока. VAD: Silero, порог 0,5, минимальная тишина 0,4 с, минимальная речь 0,25 с, максимум 20 с на сегмент.

Жизненный цикл: воркер остаётся «тёплым» между записями. Он выгружается после 10 минут простоя, при отмене записи, при ошибке ожидания итогового текста (10 с), при смене движка в настройках, при переустановке и при закрытии расширения (`common.ts`).

`start()` сначала поднимает воркер и только потом запускает ffmpeg, чтобы не потерять начало речи. Если ffmpeg неожиданно завершился, подписчики получают событие с полем `error`. Если итоговый текст не пришёл за 10 с, возвращается последний `committed + partial`.

## Ловушка Electron: «External buffers are not allowed»

В VS Code (Electron) включена защита памяти V8: нативный модуль не может отдавать «внешние» буферы. `Vad.front()` в sherpa-onnx по умолчанию возвращает именно такой буфер, и вызов падает с ошибкой `External buffers are not allowed`. Воркер вызывает `vad.front(false)`: аргумент `false` просит копию данных (`sileroVad.front(false)` в `init`). Не заменяйте на `front()` без аргумента. Ошибка проявляется только внутри VS Code, обычный Node её не воспроизводит.

## DictationAssembler

Класс не зависит от нативных библиотек, `decode` и VAD подставляются в тестах.

- `push(samples)` копит звук в `pending` и передаёт его в VAD. Если VAD отдал законченные сегменты (пауза), вызывается `commit`: распознаётся весь накопленный звук и результат добавляется в `committed`.
- Пока речь идёт, `partial` пересчитывается каждые 11200 сэмплов (0,7 с при 16 кГц).
- Пока речи нет, в буфере остаются последние 8000 сэмплов (0,5 с) тишины. Показанный `partial` при паузе не стирается.
- `commit` распознаёт весь накопленный звук, а не только сегмент VAD: сегмент обрезан вплотную, и на нём живой микрофон распознаётся хуже, вплоть до пустой строки. Запасные варианты: сегменты VAD, затем последний `partial`.
- `finish()` дочитывает хвост из VAD (`flush`) и возвращает итог. `reset()` сбрасывает состояние перед новой записью.

## Протокол и интерфейс

`DictationService.subscribeToDictationText(EmptyRequest) returns (stream DictationText)`. Поля `DictationText`: `committed`, `partial`, `final`, `error`. Обработчик `subscribeToDictationText.ts` подписывается на `SherpaDictationService.subscribe` и снимает подписку, когда webview закрывает поток.

`VoiceRecorder.tsx` в режиме GigaAM (`engine === "gigaam"` и язык `ru`) подписывается на поток перед `startRecording`. На каждое обновление без `final` он передаёт родителю `committed + partial` (`onLiveText`). Если пришёл `error`, превью убирается, запись отменяется, ошибка показывается рядом с кнопкой. Итог берётся из `stopRecording` (`finalText`). Если сообщение отправляют во время диктовки, родитель останавливает запись через `stopRef` и отправляет итоговый текст. Максимальная длина записи в UI: 5 минут.

`RecordedAudio.final_text` заполняется только движками со стримингом, для whisper он пустой.
