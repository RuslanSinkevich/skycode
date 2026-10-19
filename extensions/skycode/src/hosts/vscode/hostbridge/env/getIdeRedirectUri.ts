import { EmptyRequest, String } from "@shared/proto/skycode/common"
import * as vscode from "vscode"
import { ExtensionRegistryInfo } from "@/registry"

export async function getIdeRedirectUri(_: EmptyRequest): Promise<String> {
	const uriScheme = vscode.env.uriScheme || "vscode"
	const url = `${uriScheme}://${ExtensionRegistryInfo.id}`
	return { value: url }
}
