import { EmptyRequest } from "@shared/proto/skycode/common"
import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import { GetHostVersionResponse } from "@/shared/proto/index.host"

export async function getHostVersion(_: EmptyRequest): Promise<GetHostVersionResponse> {
	return {
		platform: vscode.env.appName,
		version: vscode.version,
		skycodeType: "VSCode Extension",
		skycodeVersion: ExtensionRegistryInfo.version,
	}
}
