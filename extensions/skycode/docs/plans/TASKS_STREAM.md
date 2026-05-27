# Task Stream

## Закрыто (2026-05-27)

| # | Задача | Коммит / ветка |
|---|--------|----------------|
| 1 | Бэкап WIP перед работой | `b7680ed` clean-main |
| 2 | Дубли diff-зон + Accept All | `ce5e8ec` |
| 3 | Сообщения в стриме «пропадают» / reload UX | `81fb2d9` |
| 4 | Merge VS Code **1.121.0** | ветка `merge/1.121.0` (`c3d477ea`) |
| 5 | Упростить upstream: Copilot не отключаем, RU locale остаётся | в merge + `VSCODE_FORK_PATCHES.md` |

## Текущие

*Пусто.*

## Следующий шаг вручную

```powershell
cd vscode
git checkout clean-main
git merge merge/1.121.0
# smoke: .\scripts\code.bat
```
