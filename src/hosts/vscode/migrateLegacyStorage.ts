import * as fs from "node:fs"
import * as path from "node:path"
import { Logger } from "@/shared/services/Logger"

/** ID расширения до переименования пакета для Marketplace (`skycode.skycode` → `skycode.skycode-ai`) */
const LEGACY_EXTENSION_ID = "skycode.skycode"

/**
 * [SKYCODE] Переносит историю задач и данные из папки прежнего ID расширения в папку нового.
 * VS Code хранит globalStorage отдельно для каждого ID, поэтому после переименования пакета
 * история пропала бы. Срабатывает один раз: только если у нового ID ещё нет своих задач.
 * Модель голосового ввода (сотни МБ) переносится, а не копируется; остальное — копируется,
 * чтобы прежняя версия расширения, если она ещё стоит, не потеряла свои данные.
 * Ключи API и настройки из globalState/SecretStorage перенести нельзя — их вводят заново.
 */
export function migrateLegacyStorage(globalStoragePath: string, extensionId: string): void {
	if (extensionId === LEGACY_EXTENSION_ID) {
		return
	}
	const legacyPath = path.join(path.dirname(globalStoragePath), LEGACY_EXTENSION_ID)
	try {
		if (!fs.existsSync(path.join(legacyPath, "tasks")) && !fs.existsSync(path.join(legacyPath, "state"))) {
			return
		}
		if (fs.existsSync(path.join(globalStoragePath, "tasks")) || fs.existsSync(path.join(globalStoragePath, "state"))) {
			return
		}
		fs.mkdirSync(globalStoragePath, { recursive: true })
		for (const entry of fs.readdirSync(legacyPath)) {
			const from = path.join(legacyPath, entry)
			const to = path.join(globalStoragePath, entry)
			if (fs.existsSync(to)) {
				continue
			}
			if (entry === "whisper") {
				fs.renameSync(from, to)
			} else {
				fs.cpSync(from, to, { recursive: true })
			}
		}
		Logger.info(`[Skycode] История перенесена из ${LEGACY_EXTENSION_ID}`)
	} catch (error) {
		Logger.error("[Skycode] Не удалось перенести данные прежней версии:", error)
	}
}
