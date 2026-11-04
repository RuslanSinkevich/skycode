import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"
import { OpenSkycodeSidebarPanelRequest, OpenSkycodeSidebarPanelResponse } from "@/shared/proto/index.host"

export async function openSkycodeSidebarPanel(_: OpenSkycodeSidebarPanelRequest): Promise<OpenSkycodeSidebarPanelResponse> {
	await vscode.commands.executeCommand(`${ExtensionRegistryInfo.views.Sidebar}.focus`)
	return {}
}
