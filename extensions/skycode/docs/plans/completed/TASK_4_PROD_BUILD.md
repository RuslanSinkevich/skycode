# Task 4: Prod-сборка [ВЫПОЛНЕНО]

## Статус: ВЫПОЛНЕНО (2026-05-23)

## Цель

Собрать всё с нуля без warning/error и получить рабочие артефакты.

## Артефакты

| Файл | Путь | Размер |
|---|---|---|
| `extension.js` | `extensions/skycode/dist/extension.js` | ~20 MB |
| `embedding-worker.js` | `extensions/skycode/dist/embedding-worker.js` | ✓ |
| webview prod | `extensions/skycode/webview-ui/build/` | ✓ |
| native sqlite | `native/sqlite/electron-37.6.0-win32-x64`, `electron-39.8.7-win32-x64` | ✓ |
| `skycode.vsix` | `extensions/skycode/dist/skycode.vsix` | 101 MB |
| `Skycode.exe` | `VSCode-win32-x64/Skycode.exe` | 201 MB |

## Проверки при сборке

- `check-types` — 0 ошибок
- `lint` (biome) — 0 ошибок
- `npm run package` — exit 0
- `npm run package:vsix` — exit 0
- `gulp vscode-win32-x64-min` — exit 0 (~8.6 мин)

## Команды

```powershell
cd D:\Users\Admin\Desktop\Skycode\vscode\extensions\skycode
Get-ChildItem src -Recurse -Include *.js,*.js.map | Remove-Item -Force
npm run package:vsix

cd D:\Users\Admin\Desktop\Skycode\vscode
Set-Content -LiteralPath "extensions\copilot\node_modules\@github\copilot\shims.txt" -Value "build" -Encoding ascii
node --max-old-space-size=8192 node_modules/gulp/bin/gulp.js vscode-win32-x64-min
```

## Запуск

```
D:\Users\Admin\Desktop\Skycode\VSCode-win32-x64\Skycode.exe
```
