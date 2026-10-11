<!-- Список изменений для текста GitHub Release (см. .github/workflows/skycode-release.yml).
     Перед каждым тегом skycode-vX.Y.Z — переписать под новую версию: одна короткая строка на пункт. -->

### Что нового

- Индекс кода работает на встроенном SQLite — больше не уходит в медленное JSON-хранилище
- Убран нативный модуль better-sqlite3: обновления Electron больше не ломают индекс
- Исправлен поиск инстанса по порту в блокировках

### What's new

- Code index runs on the built-in SQLite — no more falling back to the slow JSON storage
- Removed the native better-sqlite3 module: Electron updates no longer break the index
- Fixed instance lookup by port in locks
