<!-- Можно писать по-русски или по-английски. -->

## Что изменено

## Зачем

Ссылка на issue, если есть: #

## Какие проверки выполнены

Из `extensions/skycode`:

- [ ] `npx tsc --noEmit -p .`
- [ ] `npx tsc --noEmit -p tsconfig.test.json`
- [ ] `npx biome lint --diagnostic-level=error src webview-ui/src`
- [ ] `npm run test:unit`
- [ ] `cd webview-ui && npx vitest run`
- [ ] Проверено вручную в VS Code (установлен .vsix, выполнено "Developer: Reload Window")

Если проверка не выполнялась, напишите почему.

## Дополнительно

- [ ] Менялся `.proto`: выполнен `npm run protos`, номера полей не менялись, удалённые поля помечены `reserved`
- [ ] Менялось поведение: обновлена документация в `docs/skycode/` (русская страница и английская копия)
