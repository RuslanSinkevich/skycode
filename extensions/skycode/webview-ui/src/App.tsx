import AboutView from "./components/about/AboutView"
import ChatView from "./components/chat/ChatView"
import McpView from "./components/mcp/configuration/McpConfigurationView"
import SettingsView from "./components/settings/SettingsView"
import { useExtensionState } from "./context/ExtensionStateContext"
import { Providers } from "./Providers"

const AppContent = () => {
	const {
		didHydrateState,
		showMcp,
		mcpTab,
		showSettings,
		settingsTargetSection,
		showAccount: showAbout,
		closeMcpView,
		hideSettings,
		hideAccount: hideAbout,
	} = useExtensionState()

	if (!didHydrateState) {
		return null
	}

	return (
		<div className="flex h-screen w-full flex-col">
			{showSettings && <SettingsView onDone={hideSettings} targetSection={settingsTargetSection} />}
			{showMcp && <McpView initialTab={mcpTab} onDone={closeMcpView} />}
			{showAbout && <AboutView onDone={hideAbout} />}
			{/* Do not conditionally load ChatView, it's expensive and there's state we don't want to lose (user input, disableInput, askResponse promise, etc.) */}
			<ChatView isHidden={showSettings || showMcp || showAbout} />
		</div>
	)
}

const App = () => {
	return (
		<Providers>
			<AppContent />
		</Providers>
	)
}

export default App
