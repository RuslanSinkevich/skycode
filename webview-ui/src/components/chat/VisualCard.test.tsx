import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { render as rtlRender } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { I18nProvider } from "@/i18n"
import { VisualCard } from "./VisualCard"

describe("VisualCard", () => {
	it("renders the title and the content in a shadow root", () => {
		localStorage.setItem("skycode.interfaceLanguage", "en")
		const message: SkycodeMessage = {
			ts: 1,
			type: "say",
			say: "visual",
			text: JSON.stringify({ title: "My table", content: "<table><tr><td>1</td></tr></table>" }),
		}
		const { container, getByText } = rtlRender(
			<I18nProvider>
				<VisualCard message={message} />
			</I18nProvider>,
		)
		expect(getByText("My table")).toBeInTheDocument()
		const host = container.querySelector('[data-testid="visual-content"]')
		expect(host?.shadowRoot?.innerHTML).toContain("<table>")
	})
})
