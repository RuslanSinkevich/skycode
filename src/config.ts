export enum Environment {
	production = "production",
	staging = "staging",
	local = "local",
}

/**
 * Only the environment name is left: the per-environment URLs pointed at skycode-ai.ru
 * (account, remote config, MCP marketplace API), which no longer exists.
 */
export interface EnvironmentConfig {
	environment: Environment
}

class SkycodeEndpoint {
	public static instance = new SkycodeEndpoint()
	public static get config() {
		return SkycodeEndpoint.instance.config()
	}

	private environment: Environment = Environment.production

	private constructor() {
		// Set environment at module load. Use override if provided.
		const _env = process?.env?.SKYCODE_ENVIRONMENT_OVERRIDE || process?.env?.SKYCODE_ENVIRONMENT
		if (_env && Object.values(Environment).includes(_env as Environment)) {
			this.environment = _env as Environment
			return
		}
	}

	public config(): EnvironmentConfig {
		return this.getEnvironment()
	}

	public setEnvironment(env: string) {
		switch (env.toLowerCase()) {
			case "staging":
				this.environment = Environment.staging
				break
			case "local":
				this.environment = Environment.local
				break
			default:
				this.environment = Environment.production
				break
		}
	}

	public getEnvironment(): EnvironmentConfig {
		return { environment: this.environment }
	}
}

/**
 * Singleton instance to access the current environment configuration.
 * Usage:
 * - SkycodeEnv.config() to get the current config.
 * - SkycodeEnv.setEnvironment(Environment.local) to change the environment.
 */
export const SkycodeEnv = SkycodeEndpoint.instance
