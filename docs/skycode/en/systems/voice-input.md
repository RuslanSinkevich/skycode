> **Русская версия:** [voice-input.md](../../systems/voice-input.md)

# Voice Input

Dictation into the chat input. Recognition is local: audio does not leave your computer. For Russian, GigaAM v3 with punctuation on sherpa-onnx is used, and text appears while you speak. Other languages use whisper.cpp, and text appears after you stop recording.

Code: `extensions/skycode/src/services/dictation/`, settings: `src/shared/DictationSettings.ts`, recording button: `webview-ui/src/components/chat/VoiceRecorder.tsx`, settings tab: `webview-ui/src/components/settings/sections/VoiceSection.tsx`.

## Turning it on

Skycode settings, the **"Voice"** («Голос») tab:

1. Check "Enable voice input" (off by default).
2. Pick the recognition language (Russian by default).
3. Pick a microphone. "Auto" leaves the choice to the system. The list can be refreshed.
4. Pick the quality. For Russian "Russian — GigaAM v3" is available; for all languages there are "Basic", "Standard" and "Enhanced" (whisper.cpp: tiny, base, small).
5. Click "Download". The components are downloaded once (about 230 MB for GigaAM). "Reinstall" deletes and downloads them again.

After that a recording button appears in the input. One recording lasts at most 5 minutes.

If GigaAM is selected but the platform does not support it, the option is unavailable in the list. Supported: Windows x64, macOS arm64 and x64, Linux x64 and arm64. When you change the language from Russian to another one, the model switches to whisper.

## How GigaAM works

```
microphone → ffmpeg (PCM 16 kHz, mono) → worker (worker_thread)
                                          ├── Silero VAD: splits speech at pauses
                                          └── GigaAM v3 (sherpa-onnx): recognition
                                               ↓
                               live text → chat input
```

- `AudioRecordingService` starts ffmpeg and receives raw audio from it.
- `SherpaDictationService` passes the audio to the `sherpa-dictation-worker` worker. Recognizing one chunk takes about half a second, so it runs outside the extension host process.
- `DictationAssembler` builds the text. VAD cuts speech at pauses (silence of 0.4 s or more; speech no longer than 20 s). A finished phrase is committed. The current unfinished phrase is recomputed about every 0.7 s.
- Text is inserted at the cursor. Whatever was before and after the cursor at the start of the recording is kept.
- The worker with the model stays in memory between recordings (loading the model takes about a second) and is unloaded after 10 minutes of idle time.
- Speed, as measured by the project author: 17 seconds of speech on a regular CPU are recognized in about 1 second.

### Sending while dictating

The send button and `Enter` during recording stop the recording, wait for the final text and send the message.

## Downloaded files

Folder: `voice-sherpa/` in the extension data.

| What | From | Verification |
|---|---|---|
| sherpa-onnx runtime (`sherpa-onnx-node` and the platform package) | npm, `registry.npmjs.org` | sha512 (values are pinned in code) |
| GigaAM v3 model files: `encoder.int8.onnx`, `decoder.onnx`, `joiner.onnx`, `tokens.txt` | Hugging Face, pinned revision | sha256 |
| Fallback model source | `.tar.bz2` archive from GitHub (sherpa-onnx release), unpacked with the system `tar` | sha256 |
| Silero VAD (`silero_vad.onnx`) | GitHub (sherpa-onnx release) | sha256 |
| ffmpeg | see below | sha256 for the downloaded one |

Download behavior (`sherpa/downloadPinned.ts`):

- a file is written under a temporary name and renamed only after the hash matches; on a mismatch the download fails;
- redirects are followed; the timeout counts idle time (120 s without data), not total time;
- on a connection error the download is retried up to three times; hash mismatches and HTTP errors are not retried;
- overall progress is weighted by file size.

Hugging Face is the main model source because the `.tar.bz2` archive is unpacked with the system `tar`, which is sometimes blocked on corporate computers. The GitHub archive is used if Hugging Face is unreachable.

**ffmpeg.** An already installed one is looked up first: the whisper service folder in the extension data, the own folder `voice-sherpa/ffmpeg/`, then `PATH` and common directories. If none is found, an `ffmpeg-static` build is downloaded from GitHub.

## Whisper

For languages other than Russian (and for Russian when "Basic", "Standard" or "Enhanced" is chosen), `whisper-cli` from whisper.cpp is used:

| Quality | Model | Archive size |
|---|---|---|
| Basic | tiny | about 75 MB |
| Standard | base | about 142 MB |
| Enhanced | small | about 466 MB |

The archives with the program and the model are downloaded from the project storage (`storage.yandexcloud.net/skycode-releases`) into the `whisper/` folder of the extension data. Audio is recorded to a file; after you stop, it is converted to 16 kHz mono and recognized locally. There is no live text.

## Files

| File | Purpose |
|---|---|
| `AudioRecordingService.ts` | Recording through ffmpeg, microphone list |
| `SherpaDictationService.ts` | Worker, live text subscribers, final text |
| `SherpaLocalService.ts` | Installing and checking GigaAM files |
| `sherpa/sherpaDownloads.ts` | Table of pinned downloads and hashes |
| `sherpa/downloadPinned.ts` | Download with hash check and retries |
| `sherpa/DictationAssembler.ts` | Live text assembly |
| `workers/sherpa-dictation-worker.ts` | Recognition in a thread |
| `WhisperLocalService.ts` | Installing and running whisper.cpp |
