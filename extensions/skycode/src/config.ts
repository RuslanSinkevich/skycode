export enum Environment {
	production = "production",
	staging = "staging",
	local = "local",
}

export interface EnvironmentConfig {
	environment: Environment
	appBaseUrl: string
	apiBaseUrl: string
	mcpBaseUrl: string
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
		switch (this.environment) {
	case Environment.staging:
		return {
			environment: Environment.staging,
			appBaseUrl: "https://skycode-ai.ru",
			apiBaseUrl: "https://skycode-ai.ru",
			mcpBaseUrl: "https://skycode-ai.ru/v1/mcp",
		}
	case Environment.local:
		return {
			environment: Environment.local,
			appBaseUrl: "http://localhost:3000",
			apiBaseUrl: "http://localhost:3000",
			mcpBaseUrl: "http://localhost:3000/v1/mcp",
		}
	default:
		return {
			environment: Environment.production,
			appBaseUrl: "https://skycode-ai.ru",
			apiBaseUrl: "https://skycode-ai.ru",
			mcpBaseUrl: "https://skycode-ai.ru/v1/mcp",
		}
		}
	}
}

/**
 * Singleton instance to access the current environment configuration.
 * Usage:
 * - SkycodeEnv.config() to get the current config.
 * - SkycodeEnv.setEnvironment(Environment.local) to change the environment.
 */
export const SkycodeEnv = SkycodeEndpoint.instance
