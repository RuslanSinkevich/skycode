import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/i18n"
import { ContextRing } from "./ContextRing"

const mocks = vi.hoisted(() => ({
	askResponse: vi.fn(() => Promise.resolve({})),
	state: {} as Record<string, unknown>,
}))

vi.mock("@/services/grpc-client", () => ({
	TaskServiceClient: { askResponse: mocks.askResponse },
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => mocks.state,
}))

vi.mock("@/components/settings/utils/providerUtils", () => ({
	normalizeApiConfiguration: () => ({ selectedModelInfo: { contextWindow: 0 } }),
}))

const render = (ui: ReactElement) => {
	localStorage.setItem("skycode.interfaceLanguage", "en")
	return rtlRender(<I18nProvider>{ui}</I18nProvider>)
}

describe("ContextRing", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.state = {
			skycodeMessages: [
				{ ts: 1, type: "say", say: "api_req_started", text: JSON.stringify({ tokensIn: 43000, tokensOut: 500 }) },
			],
			contextWindowTokens: 128000,
			autoCompactThresholdTokens: 90500,
		}
	})

	it("shows percent in the tooltip and opens the popover on click", () => {
		render(<ContextRing />)
		const button = screen.getByTestId("context-ring-button")
		expect(button.getAttribute("title")).toBe("Context 34%")
		expect(screen.queryByTestId("context-ring-popover")).toBeNull()

		fireEvent.click(button)
		expect(screen.getByTestId("context-ring-popover")).toBeTruthy()
		expect(screen.getByText("Context 43.5k / 128k (34%)")).toBeTruthy()
		expect(screen.getByText("47k until auto-compaction")).toBeTruthy()
	})

	it("closes on outside click and on Escape", () => {
		render(<ContextRing />)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		fireEvent.mouseDown(document.body)
		expect(screen.queryByTestId("context-ring-popover")).toBeNull()

		fireEvent.click(screen.getByTestId("context-ring-button"))
		fireEvent.keyDown(document, { key: "Escape" })
		expect(screen.queryByTestId("context-ring-popover")).toBeNull()
	})

	it("sends /compact and is disabled while the agent works", () => {
		const { rerender } = render(<ContextRing />)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		fireEvent.click(screen.getByText("Compact session"))
		expect(mocks.askResponse).toHaveBeenCalledTimes(1)

		rerender(
			<I18nProvider>
				<ContextRing isAiWorking />
			</I18nProvider>,
		)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		expect((screen.getByText("Compact session") as HTMLButtonElement).disabled).toBe(true)
	})
})
