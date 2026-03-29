import { Logger } from "../services/Logger"
import { SkycodeStorage } from "./SkycodeStorage"

export type SecretStores = VSCodeSecretStorage | SkycodeStorage

/**
 * Wrapper around VSCode Secret Storage or any other storage type for managing secrets.
 */
export class SkycodeSecretStorage extends SkycodeStorage {
	override readonly name = "SkycodeSecretStorage"
	private static store: SkycodeSecretStorage | null = null
	static get instance(): SkycodeSecretStorage {
		if (!SkycodeSecretStorage.store) {
			SkycodeSecretStorage.store = new SkycodeSecretStorage()
		}
		return SkycodeSecretStorage.store
	}

	private secretStorage: SecretStores | null = null

	public get storage(): SecretStores {
		if (!this.secretStorage) {
			throw new Error("[SkycodeSecretStorage] init not called")
		}
		return this.secretStorage
	}

	public init(store: SecretStores) {
		if (!this.secretStorage) {
			this.secretStorage = store
			Logger.info("[SkycodeSecretStorage] initialized")
		}
		return this.secretStorage
	}

	protected async _get(key: string): Promise<string | undefined> {
		try {
			return key ? await this.storage.get(key) : undefined
		} catch (error) {
			Logger.error("[SkycodeSecretStorage]", error)
			return undefined
		}
	}

	/**
	 * [SECURITY] Avoid logging secrets values.
	 */
	protected async _store(key: string, value: string): Promise<void> {
		try {
			if (value && value.length > 0) {
				await this.storage.store(key, value)
			}
		} catch (error) {
			Logger.error("[SkycodeSecretStorage]", error)
		}
	}

	protected async _delete(key: string): Promise<void> {
		Logger.info("[SkycodeSecretStorage] deleting secret")
		await this.storage.delete(key)
	}
}

interface VSCodeSecretStorage {
	get(key: string): Thenable<string | undefined>

	store(key: string, value: string): Thenable<void>

	delete(key: string): Thenable<void>

	onDidChange: any
}

/**
 * Singleton instance of SkycodeSecretStorage
 */
export const secretStorage = SkycodeSecretStorage.instance
