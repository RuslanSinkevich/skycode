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
				{ ts: 2, type: "ask", ask: "completion_result", text: "" },
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

	it("renders the breakdown list and a hint for a dominant category", () => {
		mocks.state = {
			...mocks.state,
			contextBreakdown: [
				{ category: "system", tokens: 5000 },
				{ category: "files", tokens: 35000 },
				{ category: "conversation", tokens: 3500 },
			],
		}
		render(<ContextRing />)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		expect(screen.getByText("System prompt and tools")).toBeTruthy()
		expect(screen.getByText("Files and search")).toBeTruthy()
		expect(screen.getByText("35k · 80%")).toBeTruthy()
		expect(screen.getByTestId("context-ring-segment-files")).toBeTruthy()
		expect(screen.getByTestId("context-ring-hint").textContent).toContain("File reads")
	})

	it("keeps the single bar when there is no breakdown", () => {
		render(<ContextRing />)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		expect(screen.queryByTestId("context-ring-breakdown")).toBeNull()
		expect(screen.queryByTestId("context-ring-hint")).toBeNull()
	})

	it("disables compaction while a tool/command approval is pending", () => {
		mocks.state = {
			...mocks.state,
			skycodeMessages: [
				{ ts: 1, type: "say", say: "api_req_started", text: JSON.stringify({ tokensIn: 100 }) },
				{ ts: 2, type: "ask", ask: "command", text: "ls" },
			],
		}
		render(<ContextRing />)
		fireEvent.click(screen.getByTestId("context-ring-button"))
		expect((screen.getByText("Compact session") as HTMLButtonElement).disabled).toBe(true)
	})
})
