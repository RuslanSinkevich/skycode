/**
 * Simple Logger utility for the extension's backend code.
 */
export class Logger {
	private static isVerbose = process.env.IS_DEV === "true"

	private static output: (msg: string) => void = console.log

	/**
	 * Configure the output function for Logger.
	 * Call this once at extension startup to inject the host-specific logger.
	 */
	static setOutput(outputFn: (msg: string) => void) {
		Logger.output = outputFn
	}

	static error(message: string, ...args: any[]) {
		Logger.#output("ERROR", message, undefined, args)
	}

	static warn(message: string, ...args: any[]) {
		Logger.#output("WARN", message, undefined, args)
	}

	static log(message: string, ...args: any[]) {
		Logger.#output("LOG", message, undefined, args)
	}

	static debug(message: string, ...args: any[]) {
		Logger.#output("DEBUG", message, undefined, args)
	}

	static info(message: string, ...args: any[]) {
		Logger.#output("INFO", message, undefined, args)
	}

	static trace(message: string, ...args: any[]) {
		Logger.#output("TRACE", message, undefined, args)
	}

	static #output(level: string, message: string, error: Error | undefined, args: any[]) {
		try {
			let fullMessage = message
			if (args.length > 0) {
				fullMessage += ` ${args.map((arg) => Logger.#formatArg(arg)).join(" ")}`
			}
			const errorSuffix = error?.message ? ` ${error.message}` : ""
			Logger.output(`${level} ${fullMessage}${errorSuffix}`.trimEnd())
		} catch {
			// do nothing if Logger fails
		}
	}

	/**
	 * [SKYCODE] Раньше всё после сообщения печаталось только в verbose-режиме, да и то через
	 * JSON.stringify — а он превращает Error в "{}". В логах оставались обрубки вида
	 * `ERROR Search failed in ...:` без причины, и настоящие поломки жили незамеченными.
	 */
	static #formatArg(arg: unknown): string {
		if (arg instanceof Error) {
			const base = `${arg.name}: ${arg.message}`
			return Logger.isVerbose && arg.stack ? arg.stack : base
		}
		if (typeof arg === "string") {
			return arg
		}
		try {
			return JSON.stringify(arg) ?? String(arg)
		} catch {
			return String(arg)
		}
	}
}
