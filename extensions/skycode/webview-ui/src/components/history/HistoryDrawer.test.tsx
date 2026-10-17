import type { TabInfo } from "@shared/ExtensionMessage"
import type { HistoryItem } from "@shared/HistoryItem"
import { fireEvent, render as rtlRender, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/i18n"
import { HistoryDrawer } from "./HistoryDrawer"

const mocks = vi.hoisted(() => ({
	switchTab: vi.fn(() => Promise.resolve({})),
	newTab: vi.fn(() => Promise.resolve({})),
	showTaskWithId: vi.fn(() => Promise.resolve({})),
	deleteTasksWithIds: vi.fn(() => Promise.resolve({})),
	state: {
		tabs: [] as TabInfo[],
		activeTabId: undefined as string | undefined,
		taskHistory: [] as HistoryItem[],
	},
}))

vi.mock("@/services/grpc-client", () => ({
	TaskServiceClient: {
		switchTab: mocks.switchTab,
		newTab: mocks.newTab,
		showTaskWithId: mocks.showTaskWithId,
		deleteTasksWithIds: mocks.deleteTasksWithIds,
	},
}))

vi.mock("@/context/ExtensionStateContext", () => ({
	useExtensionState: () => mocks.state,
}))

const render = (ui: ReactElement) => {
	localStorage.setItem("skycode.interfaceLanguage", "en")
	return rtlRender(<I18nProvider>{ui}</I18nProvider>)
}

const historyItem = (id: string, task: string, isFavorited = false): HistoryItem => ({
	id,
	task,
	ts: Date.now() - 1000,
	tokensIn: 0,
	tokensOut: 0,
	totalCost: 0,
	isFavorited,
})

describe("HistoryDrawer", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.state.tabs = [{ id: "s1", taskId: "t1", title: "Open chat", status: "running", ts: 1 }]
		mocks.state.activeTabId = "s1"
		mocks.state.taskHistory = [
			historyItem("t1", "Open chat"),
			historyItem("t2", "Old chat"),
			historyItem("t3", "Fav chat", true),
		]
	})

	it("renders nothing when closed", () => {
		render(<HistoryDrawer onClose={vi.fn()} open={false} />)
		expect(screen.queryByTestId("history-drawer")).toBeNull()
	})

	it("lists a task open in a tab only under open tabs, not in history", () => {
		render(<HistoryDrawer onClose={vi.fn()} open />)
		expect(screen.getAllByTitle("Open chat")).toHaveLength(1)
		expect(screen.getByText("Old chat")).toBeTruthy()
	})

	it("filters by search text", () => {
		render(<HistoryDrawer onClose={vi.fn()} open />)
		fireEvent.change(screen.getByPlaceholderText("Search chats"), { target: { value: "fav" } })
		expect(screen.queryByText("Old chat")).toBeNull()
		expect(screen.getByText("Fav chat")).toBeTruthy()
	})

	it("switches to an open tab and closes", () => {
		const onClose = vi.fn()
		render(<HistoryDrawer onClose={onClose} open />)
		fireEvent.click(screen.getByTitle("Open chat"))
		expect(mocks.switchTab).toHaveBeenCalledWith(expect.objectContaining({ value: "s1" }))
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("opens a history task in a new tab and closes", () => {
		const onClose = vi.fn()
		render(<HistoryDrawer onClose={onClose} open />)
		fireEvent.click(screen.getByText("Old chat"))
		expect(mocks.showTaskWithId).toHaveBeenCalledWith(expect.objectContaining({ value: "t2" }))
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("creates a new chat and closes", () => {
		const onClose = vi.fn()
		render(<HistoryDrawer onClose={onClose} open />)
		fireEvent.click(screen.getByRole("button", { name: "New chat" }))
		expect(mocks.newTab).toHaveBeenCalledTimes(1)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("deletes a task without opening it; favorites cannot be deleted", () => {
		render(<HistoryDrawer onClose={vi.fn()} open />)
		const buttons = screen.getAllByRole("button", { name: "Delete" })
		expect(buttons).toHaveLength(2)
		fireEvent.click(buttons[0])
		expect(mocks.deleteTasksWithIds).toHaveBeenCalledWith(expect.objectContaining({ value: ["t2"] }))
		expect(mocks.showTaskWithId).not.toHaveBeenCalled()
		expect((buttons[1] as HTMLButtonElement).disabled).toBe(true)
	})

	it("closes on Escape and on backdrop click", () => {
		const onClose = vi.fn()
		render(<HistoryDrawer onClose={onClose} open />)
		fireEvent.keyDown(document, { key: "Escape" })
		fireEvent.click(screen.getByTestId("history-drawer-backdrop"))
		expect(onClose).toHaveBeenCalledTimes(2)
	})
})
