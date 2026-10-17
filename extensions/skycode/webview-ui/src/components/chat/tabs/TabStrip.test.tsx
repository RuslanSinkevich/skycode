import type { TabInfo } from "@shared/ExtensionMessage"
import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/i18n"
import { TabStrip } from "./TabStrip"

const mocks = vi.hoisted(() => ({
	switchTab: vi.fn(() => Promise.resolve({})),
	closeTab: vi.fn(() => Promise.resolve({})),
	newTab: vi.fn(() => Promise.resolve({})),
	onToggleHistory: vi.fn(),
	state: { tabs: [] as TabInfo[], activeTabId: undefined as string | undefined },
}))

vi.mock("@/services/grpc-client", () => ({
	TaskServiceClient: { switchTab: mocks.switchTab, closeTab: mocks.closeTab, newTab: mocks.newTab },
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => mocks.state,
}))

// The interface language defaults to Russian; the assertions below use the English strings.
const render = (ui: ReactElement) => {
	localStorage.setItem("skycode.interfaceLanguage", "en")
	return rtlRender(<I18nProvider>{ui}</I18nProvider>)
}

const tab = (id: string, status: TabInfo["status"], title = `Title ${id}`, taskId = `task-${id}`): TabInfo => ({
	id,
	taskId,
	title,
	status,
	ts: 1,
})

describe("TabStrip", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.state.tabs = [tab("a", "running"), tab("b", "awaiting"), tab("c", "done"), tab("d", "idle", "", "")]
		mocks.state.activeTabId = "a"
	})

	it("renders nothing without tabs", () => {
		mocks.state.tabs = []
		const { container } = render(<TabStrip />)
		expect(container).toBeEmptyDOMElement()
	})

	it("renders tabs with titles, statuses and the empty-tab fallback", () => {
		render(<TabStrip />)
		expect(screen.getAllByRole("tab")).toHaveLength(4)
		expect(screen.getByText("Title a")).toBeInTheDocument()
		expect(screen.getByRole("img", { name: "Running" })).toBeInTheDocument()
		expect(screen.getByRole("img", { name: "Awaiting approval" })).toBeInTheDocument()
		expect(screen.getByRole("img", { name: "Done" })).toBeInTheDocument()
		expect(screen.getByText("New task")).toBeInTheDocument()
		expect(screen.getAllByRole("tab")[0]).toHaveAttribute("aria-selected", "true")
	})

	it("switches tab on click", () => {
		render(<TabStrip />)
		fireEvent.click(screen.getByText("Title b"))
		expect(mocks.switchTab).toHaveBeenCalledWith(expect.objectContaining({ value: "b" }))
	})

	it("closes tab by the cross without switching, and by middle click", () => {
		render(<TabStrip />)
		fireEvent.click(screen.getAllByRole("button", { name: "Close tab" })[1])
		expect(mocks.closeTab).toHaveBeenCalledWith(expect.objectContaining({ value: "b" }))
		expect(mocks.switchTab).not.toHaveBeenCalled()
		fireEvent(screen.getByText("Title c"), new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }))
		expect(mocks.closeTab).toHaveBeenCalledWith(expect.objectContaining({ value: "c" }))
	})

	it("opens a new tab and toggles the history drawer", () => {
		render(<TabStrip onToggleHistory={mocks.onToggleHistory} />)
		fireEvent.click(screen.getByRole("button", { name: "New tab" }))
		expect(mocks.newTab).toHaveBeenCalledTimes(1)
		fireEvent.click(screen.getByRole("button", { name: "History" }))
		expect(mocks.onToggleHistory).toHaveBeenCalledTimes(1)
	})

	it("shows the overflow list when tabs do not fit and switches from it", () => {
		mocks.state.tabs = [tab("a", "idle"), tab("b", "idle"), tab("c", "idle"), tab("d", "idle"), tab("e", "idle")]
		mocks.state.activeTabId = "e"
		render(<TabStrip measureWidth={() => 300} />)
		// 300 - 64 - 56 = 180 -> one tab fits; the active one stays visible
		expect(screen.getAllByRole("tab")).toHaveLength(1)
		expect(screen.getByText("Title e")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "More tabs" }))
		expect(screen.getByText("+4")).toBeInTheDocument()
		fireEvent.click(screen.getAllByRole("menuitem")[1])
		expect(mocks.switchTab).toHaveBeenCalledWith(expect.objectContaining({ value: "b" }))
	})
})
