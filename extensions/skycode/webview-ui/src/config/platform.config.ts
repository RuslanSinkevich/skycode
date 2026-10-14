import platformConfigs from "./platform-configs.json"

/**
 * Webview platform settings. Skycode runs only inside VS Code, so there is a single configuration;
 * messages to the extension go through the VS Code webview API without extra encoding.
 */
export interface PlatformConfig {
	showNavbar: boolean
	postMessage: PostMessageFunction
	encodeMessage: MessageEncoder
	decodeMessage: MessageDecoder
	togglePlanActKeys: string
	supportsTerminalMentions: boolean
}

declare global {
	function acquireVsCodeApi(): any
}

// Initialize the vscode API if available
const vsCodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null

const postMessage: PostMessageFunction = (message: any) => {
	if (vsCodeApi) {
		vsCodeApi.postMessage(message)
	} else {
		console.log("postMessage fallback: ", message)
	}
}

// Callers should use this in the situations where the react component is not available.
export const PLATFORM_CONFIG: PlatformConfig = {
	showNavbar: platformConfigs.vscode.showNavbar,
	postMessage,
	encodeMessage: <T>(message: T, _encoder: (_: T) => unknown) => message,
	decodeMessage: <T>(message: any, _decoder: (_: { [key: string]: any }) => T) => message,
	togglePlanActKeys: platformConfigs.vscode.togglePlanActKeys,
	supportsTerminalMentions: platformConfigs.vscode.supportsTerminalMentions,
}

// Function types for platform-specific behaviors
type PostMessageFunction = (message: any) => void
type MessageEncoder = <T>(message: T, encoder: (_: T) => unknown) => any
type MessageDecoder = <T>(message: any, decoder: (_: { [key: string]: any }) => T) => T
