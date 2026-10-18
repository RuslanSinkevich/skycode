import { ApiConfiguration } from "@shared/api"
import { fireEvent, render as rtlRender, screen, within } from "@testing-library/react"
import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ExtensionStateContextProvider, useExtensionState } from "@/context/ExtensionStateContext"
import ApiOptions from "../ApiOptions"
import { I18nProvider } from "@/i18n"

// The interface language defaults to Russian; the assertions below use the English strings.
const render = (ui: ReactElement) => {
	localStorage.setItem("skycode.interfaceLanguage", "en")
	return rtlRender(ui, { wrapper: I18nProvider })
}

vi.mock("../../../context/ExtensionStateContext", async (importOriginal) => {
	const actual = await importOriginal()
	return {
		...(actual || {}),
		// your mocked methods
		useExtensionState: vi.fn(() => ({
			apiConfiguration: {
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
			},
			setApiConfiguration: vi.fn(),
			planActSeparateModelsSetting: false,
		})),
	}
})

const mockExtensionState = (apiConfiguration: Partial<ApiConfiguration>) => {
	vi.mocked(useExtensionState).mockReturnValue({
		apiConfiguration,
		setApiConfiguration: vi.fn(),
		planActSeparateModelsSetting: false,
	} as any)
}

describe("OpenApiInfoOptions", () => {
	const mockPostMessage = vi.fn()

	beforeEach(() => {
		vi.clearAllMocks()
		//@ts-expect-error - vscode is not defined in the global namespace in test environment
		global.vscode = { postMessage: mockPostMessage }
		mockExtensionState({
			planModeApiProvider: "openai",
			actModeApiProvider: "openai",
		})
	})

	it("renders OpenAI Supports Images input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		const apiKeyInput = screen.getByText("Supports images")
		expect(apiKeyInput).toBeInTheDocument()
	})

	it("renders OpenAI Context Window Size input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		const orgIdInput = screen.getByText("Context window size")
		expect(orgIdInput).toBeInTheDocument()
	})

	it("renders OpenAI Max Output Tokens input", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		// [SKYCODE] Макс. выходных токенов лежит в свёрнутом блоке «Дополнительно»
		expect(screen.queryByText("Max output tokens")).not.toBeInTheDocument()
		fireEvent.click(within(screen.getByTestId("openai-compatible-advanced")).getByRole("button"))
		const modelInput = screen.getByText("Max output tokens")
		expect(modelInput).toBeInTheDocument()
	})

	// [SKYCODE] Второстепенные провайдеры спрятаны под «More providers», поиск находит все
	it("hides secondary providers until 'More providers' is expanded", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		fireEvent.focus(screen.getByTestId("provider-selector-input"))
		expect(screen.getByTestId("provider-option-ollama")).toBeInTheDocument()
		expect(screen.queryByTestId("provider-option-anthropic")).not.toBeInTheDocument()
		fireEvent.click(screen.getByTestId("provider-more-toggle"))
		expect(screen.getByTestId("provider-option-anthropic")).toBeInTheDocument()
		expect(screen.getByTestId("provider-option-openrouter")).toBeInTheDocument()
	})

	it("finds secondary providers by search", () => {
		render(
			<ExtensionStateContextProvider>
				<ApiOptions currentMode="plan" showModelOptions={true} />
			</ExtensionStateContextProvider>,
		)
		const input = screen.getByTestId("provider-selector-input")
		fireEvent.focus(input)
		// VSCodeTextField — кастомный элемент без нативного value setter, поэтому задаём value вручную
		;(input as HTMLInputElement).value = "Anthropic"
		fireEvent.input(input)
		expect(screen.getByTestId("provider-option-anthropic")).toBeInTheDocument()
	})
})
