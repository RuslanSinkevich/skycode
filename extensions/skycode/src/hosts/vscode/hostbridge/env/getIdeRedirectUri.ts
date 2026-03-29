import { EmptyRequest, String } from "@shared/proto/skycode/common"
import * as vscode from "vscode"

export async function getIdeRedirectUri(_: EmptyRequest): Promise<String> {
	const uriScheme = vscode.env.uriScheme || "vscode"
	const url = `${uriScheme}://skycode.skycode`
	return { value: url }
}
