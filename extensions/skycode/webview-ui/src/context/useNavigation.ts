import { useCallback, useState } from "react"
import { EmptyRequest } from "@shared/proto/skycode/common"
import type { McpViewTab } from "../../../src/shared/mcp"
import { StateServiceClient } from "../services/grpc-client"

export interface NavigationState {
	showMcp: boolean
	mcpTab: McpViewTab | undefined
	showSettings: boolean
	settingsTargetSection: string | undefined
	showHistory: boolean
	showAccount: boolean
	showAnnouncement: boolean
	showChatModelSelector: boolean
}

export interface NavigationActions {
	setShowMcp: (value: boolean) => void
	setMcpTab: (tab?: McpViewTab) => void
	closeMcpView: () => void

	hideSettings: () => void
	hideHistory: () => void
	hideAccount: () => void
	hideAnnouncement: () => void
	hideChatModelSelector: () => void

	navigateToMcp: (tab?: McpViewTab) => void
	navigateToSettings: (targetSection?: string) => void
	navigateToHistory: () => void
	navigateToAccount: () => void
	navigateToChat: () => void

	setShowAnnouncement: (value: boolean) => void
	setShowChatModelSelector: (value: boolean) => void
}

export function useNavigation(): NavigationState & NavigationActions {
	const [showMcp, setShowMcp] = useState(false)
	const [mcpTab, setMcpTab] = useState<McpViewTab | undefined>(undefined)
	const [showSettings, setShowSettings] = useState(false)
	const [settingsTargetSection, setSettingsTargetSection] = useState<string | undefined>(undefined)
	const [showHistory, setShowHistory] = useState(false)
	const [showAccount, setShowAccount] = useState(false)
	const [showAnnouncement, setShowAnnouncement] = useState(false)
	const [showChatModelSelector, setShowChatModelSelector] = useState(false)

	const closeMcpView = useCallback(() => {
		setShowMcp(false)
		setMcpTab(undefined)
	}, [])

	const hideSettings = useCallback(() => {
		setShowSettings(false)
		setSettingsTargetSection(undefined)
		StateServiceClient.refreshBanners(EmptyRequest.create({})).catch((err) => console.error("Failed to refresh banners:", err))
	}, [])
	const hideHistory = useCallback(() => setShowHistory(false), [])
	const hideAccount = useCallback(() => setShowAccount(false), [])
	const hideAnnouncement = useCallback(() => setShowAnnouncement(false), [])
	const hideChatModelSelector = useCallback(() => setShowChatModelSelector(false), [])

	const navigateToMcp = useCallback(
		(tab?: McpViewTab) => {
			setShowSettings(false)
			setShowHistory(false)
			setShowAccount(false)
			if (tab) { setMcpTab(tab) }
			setShowMcp(true)
		},
		[],
	)

	const navigateToSettings = useCallback(
		(targetSection?: string) => {
			setShowHistory(false)
			closeMcpView()
			setShowAccount(false)
			setSettingsTargetSection(targetSection)
			setShowSettings(true)
		},
		[closeMcpView],
	)

	const navigateToHistory = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowAccount(false)
		setShowHistory(true)
	}, [closeMcpView])

	const navigateToAccount = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(true)
	}, [closeMcpView])

	const navigateToChat = useCallback(() => {
		setShowSettings(false)
		closeMcpView()
		setShowHistory(false)
		setShowAccount(false)
	}, [closeMcpView])

	return {
		showMcp,
		mcpTab,
		showSettings,
		settingsTargetSection,
		showHistory,
		showAccount,
		showAnnouncement,
		showChatModelSelector,

		setShowMcp,
		setMcpTab,
		closeMcpView,
		hideSettings,
		hideHistory,
		hideAccount,
		hideAnnouncement,
		hideChatModelSelector,

		navigateToMcp,
		navigateToSettings,
		navigateToHistory,
		navigateToAccount,
		navigateToChat,

		setShowAnnouncement,
		setShowChatModelSelector,
	}
}
