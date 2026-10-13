import type { SkycodeMessage } from "@shared/ExtensionMessage"
import { render as rtlRender, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { I18nProvider } from "@/i18n"
import ErrorRow from "./ErrorRow"

// Mock SkycodeError
vi.mock("../../../../src/services/error/SkycodeError", () => ({
	SkycodeError: {
		parse: vi.fn(),
	},
	SkycodeErrorType: {
		RateLimit: "rateLimit",
		Auth: "auth",
	},
}))

// The interface language defaults to Russian; the assertions below use the English strings.
const render = (ui: ReactElement) => {
	localStorage.setItem("skycode.interfaceLanguage", "en")
	return rtlRender(<I18nProvider>{ui}</I18nProvider>)
}

describe("ErrorRow", () => {
	const mockMessage: SkycodeMessage = {
		ts: 123456789,
		type: "say",
		say: "error",
		text: "Test error message",
	}

	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("renders basic error message", () => {
		render(<ErrorRow errorType="error" message={mockMessage} />)

		expect(screen.getByText("Test error message")).toBeInTheDocument()
	})

	it("renders mistake limit reached error", () => {
		const mistakeMessage = { ...mockMessage, text: "Mistake limit reached" }
		render(<ErrorRow errorType="mistake_limit_reached" message={mistakeMessage} />)

		expect(screen.getByText("Mistake limit reached")).toBeInTheDocument()
	})

	it("renders diff error", () => {
		render(<ErrorRow errorType="diff_error" message={mockMessage} />)

		expect(
			screen.getByText("The model used search patterns that don't match anything in the file. Retrying..."),
		).toBeInTheDocument()
	})

	it("renders skycodeignore error", () => {
		const skycodeignoreMessage = { ...mockMessage, text: "/path/to/file.txt" }
		render(<ErrorRow errorType="skycodeignore_error" message={skycodeignoreMessage} />)

		expect(screen.getByText(/Skycode tried to access/)).toBeInTheDocument()
		expect(screen.getByText("/path/to/file.txt")).toBeInTheDocument()
	})

	describe("API error handling", () => {
		it("renders rate limit error with request ID", async () => {
			const mockSkycodeError = {
				message: "Rate limit exceeded",
				isErrorType: vi.fn((type) => type === "rateLimit"),
				_error: {
					request_id: "req_123456",
				},
			}

			const { SkycodeError } = await import("../../../../src/services/error/SkycodeError")
			vi.mocked(SkycodeError.parse).mockReturnValue(mockSkycodeError as any)

			render(<ErrorRow apiRequestFailedMessage="Rate limit exceeded" errorType="error" message={mockMessage} />)

			expect(screen.getByText("Rate limit exceeded")).toBeInTheDocument()
			expect(screen.getByText("Request ID: req_123456")).toBeInTheDocument()
		})

		it("renders a PowerShell hint when the error mentions PowerShell", async () => {
			const mockSkycodeError = {
				message: "PowerShell is not recognized as an internal or external command",
				isErrorType: vi.fn(() => false),
				_error: {},
			}

			const { SkycodeError } = await import("../../../../src/services/error/SkycodeError")
			vi.mocked(SkycodeError.parse).mockReturnValue(mockSkycodeError as any)

			render(
				<ErrorRow
					apiRequestFailedMessage="PowerShell is not recognized as an internal or external command"
					errorType="error"
					message={mockMessage}
				/>,
			)

			expect(screen.getByText(/PowerShell is not recognized/)).toBeInTheDocument()
			expect(screen.getByText(/Looks like a Windows PowerShell issue/)).toBeInTheDocument()
			expect(screen.queryByRole("link")).toBeNull()
		})

		it("handles apiReqStreamingFailedMessage instead of apiRequestFailedMessage", async () => {
			const mockSkycodeError = {
				message: "Streaming failed",
				isErrorType: vi.fn(() => false),
				_error: {},
			}

			const { SkycodeError } = await import("../../../../src/services/error/SkycodeError")
			vi.mocked(SkycodeError.parse).mockReturnValue(mockSkycodeError as any)

			render(<ErrorRow apiReqStreamingFailedMessage="Streaming failed" errorType="error" message={mockMessage} />)

			expect(screen.getByText("Streaming failed")).toBeInTheDocument()
		})

		it("falls back to regular error message when SkycodeError.parse returns null", async () => {
			const { SkycodeError } = await import("../../../../src/services/error/SkycodeError")
			vi.mocked(SkycodeError.parse).mockReturnValue(undefined)

			render(<ErrorRow apiRequestFailedMessage="Some API error" errorType="error" message={mockMessage} />)

			// When SkycodeError.parse returns null, the raw apiRequestFailedMessage is shown
			expect(screen.getByText("Some API error")).toBeInTheDocument()
		})

		it("renders regular error message when no API error messages are provided", () => {
			render(<ErrorRow errorType="error" message={mockMessage} />)

			expect(screen.getByText("Test error message")).toBeInTheDocument()
		})
	})
})
