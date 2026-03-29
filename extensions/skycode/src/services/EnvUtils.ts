import { isMultiRootWorkspace } from "@/core/workspace/utils/workspace-detection"
import { HostProvider } from "@/hosts/host-provider"
import { ExtensionRegistryInfo } from "@/registry"
import { EmptyRequest } from "@/shared/proto/skycode/common"
import { Logger } from "@/shared/services/Logger"

// Canonical header names for extra client/host context
export const SkycodeHeaders = {
	PLATFORM: "X-PLATFORM",
	PLATFORM_VERSION: "X-PLATFORM-VERSION",
	CLIENT_VERSION: "X-CLIENT-VERSION",
	CLIENT_TYPE: "X-CLIENT-TYPE",
	CORE_VERSION: "X-CORE-VERSION",
	IS_MULTIROOT: "X-IS-MULTIROOT",
} as const
export type SkycodeHeaderName = (typeof SkycodeHeaders)[keyof typeof SkycodeHeaders]

export async function buildBasicSkycodeHeaders(): Promise<Record<string, string>> {
	const headers: Record<string, string> = {}
	try {
		const host = await HostProvider.env.getHostVersion(EmptyRequest.create({}))
		headers[SkycodeHeaders.PLATFORM] = host.platform || "unknown"
		headers[SkycodeHeaders.PLATFORM_VERSION] = host.version || "unknown"
		headers[SkycodeHeaders.CLIENT_TYPE] = host.skycodeType || "unknown"
		headers[SkycodeHeaders.CLIENT_VERSION] = host.skycodeVersion || "unknown"
	} catch (error) {
		Logger.log("Failed to get IDE/platform info via HostBridge EnvService.getHostVersion", error)
		headers[SkycodeHeaders.PLATFORM] = "unknown"
		headers[SkycodeHeaders.PLATFORM_VERSION] = "unknown"
		headers[SkycodeHeaders.CLIENT_TYPE] = "unknown"
		headers[SkycodeHeaders.CLIENT_VERSION] = "unknown"
	}
	headers[SkycodeHeaders.CORE_VERSION] = ExtensionRegistryInfo.version

	return headers
}

export async function buildSkycodeExtraHeaders(): Promise<Record<string, string>> {
	const headers = await buildBasicSkycodeHeaders()

	try {
		const isMultiRoot = await isMultiRootWorkspace()
		headers[SkycodeHeaders.IS_MULTIROOT] = isMultiRoot ? "true" : "false"
	} catch (error) {
		Logger.log("Failed to detect multi-root workspace", error)
		headers[SkycodeHeaders.IS_MULTIROOT] = "false"
	}

	return headers
}
