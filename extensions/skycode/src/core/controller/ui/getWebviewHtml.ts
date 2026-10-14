import { EmptyRequest, String } from "@shared/proto/skycode/common"
import { WebviewProvider } from "@/core/webview"
import type { Controller } from "../index"

/**
 * Returns the HTML content of the webview.
 *
 * The VSCode extension gets the HTML directly from the webview when it is resolved through `resolveWebviewView()`;
 * this RPC is kept because it is part of the ProtoBus ui service.
 */
export async function getWebviewHtml(_controller: Controller, _: EmptyRequest): Promise<String> {
	const webview = WebviewProvider.getInstance()
	return Promise.resolve(String.create({ value: webview.getHtmlContent() }))
}
