import { mentionRegex } from "@shared/context-mentions"
import { EmptyRequest, StringRequest } from "@shared/proto/skycode/common"
import { FileSearchRequest, FileSearchType } from "@shared/proto/skycode/file"
import { type SlashCommand } from "@shared/slashCommands"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { AtSignIcon, PlusIcon } from "lucide-react"
import type React from "react"
import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import DynamicTextArea from "react-textarea-autosize"
import { useWindowSize } from "react-use"
import ContextMenu from "@/components/chat/ContextMenu"
import ModelPickerModal from "@/components/chat/ModelPickerModal"
import SlashCommandMenu from "@/components/chat/SlashCommandMenu"
import Thumbnails from "@/components/common/Thumbnails"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { usePlatform } from "@/context/PlatformContext"
import { useSkycodeAuth } from "@/context/SkycodeAuthContext"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import { FileServiceClient, TaskServiceClient } from "@/services/grpc-client"
import {
	ContextMenuOptionType,
	getContextMenuOptionIndex,
	getContextMenuOptions,
	insertMention,
	insertMentionDirectly,
	removeMention,
	type SearchResult,
	shouldShowContextMenu,
} from "@/utils/context-mentions"
import { useMetaKeyDetection, useShortcut } from "@/utils/hooks"
import { isSafari } from "@/utils/platformUtils"
import {
	getMatchingSlashCommands,
	insertSlashCommand,
	removeSlashCommand,
	shouldShowSlashCommandsMenu,
	slashCommandDeleteRegex,
} from "@/utils/slash-commands"
import SkycodeRulesToggleModal from "../skycode-rules/SkycodeRulesToggleModal"
import {
	MODE_COLORS,
	ButtonGroup,
	ButtonContainer,
	ModelContainer,
	ModelButtonWrapper,
	ModelDisplayButton,
	ModelButtonContent,
} from "./chat-text-area/ChatTextArea.styles"
import ModeSwitcher from "./chat-text-area/ModeSwitcher"
import { useChatAttachments } from "./chat-text-area/useChatAttachments"
import { useModelSelector } from "./chat-text-area/useModelSelector"
import { useTextHighlight } from "./chat-text-area/useTextHighlight"
import ServersToggleModal from "./ServersToggleModal"
import VoiceRecorder from "./VoiceRecorder"

// Set to "File" option by default
const DEFAULT_CONTEXT_MENU_OPTION = getContextMenuOptionIndex(ContextMenuOptionType.File)

interface ChatTextAreaProps {
	inputValue: string
	activeQuote: string | null
	setInputValue: (value: string) => void
	sendingDisabled: boolean
	placeholderText: string
	selectedFiles: string[]
	selectedImages: string[]
	setSelectedImages: React.Dispatch<React.SetStateAction<string[]>>
	setSelectedFiles: React.Dispatch<React.SetStateAction<string[]>>
	onSend: () => void
	onSelectFilesAndImages: () => void
	shouldDisableFilesAndImages: boolean
	onHeightChange?: (height: number) => void
	onFocusChange?: (isFocused: boolean) => void
	/** Show "AI working" indicator */
	isAiWorking?: boolean
	/** Cancel the currently running task */
	onCancel?: () => void
}

interface GitCommit {
	type: ContextMenuOptionType.Git
	value: string
	label: string
	description: string
}

const ChatTextArea = forwardRef<HTMLTextAreaElement, ChatTextAreaProps>(
	(
		{
			inputValue,
			setInputValue,
			sendingDisabled,
			placeholderText,
			selectedFiles,
			selectedImages,
			setSelectedImages,
			setSelectedFiles,
			onSend,
			onSelectFilesAndImages,
			shouldDisableFilesAndImages,
			onHeightChange,
			onFocusChange,
			isAiWorking,
			onCancel,
		},
		ref,
	) => {
		const { t } = useI18n()
		const {
			mode,
			apiConfiguration,
			openRouterModels,
			platform,
			localWorkflowToggles,
			globalWorkflowToggles,
			remoteWorkflowToggles,
			remoteConfigSettings,
			showChatModelSelector: showModelSelector,
			setShowChatModelSelector: setShowModelSelector,
			dictationSettings,
			navigateToSettings,
			navigateToAccount,
		} = useExtensionState()
		const { skycodeUser } = useSkycodeAuth()
		const [isTextAreaFocused, setIsTextAreaFocused] = useState(false)
		const [gitCommits, setGitCommits] = useState<GitCommit[]>([])
		const [isVoiceRecording, setIsVoiceRecording] = useState(false)
		const [isVoiceProcessing, setIsVoiceProcessing] = useState(false)
		const [showSlashCommandsMenu, setShowSlashCommandsMenu] = useState(false)
		const [selectedSlashCommandsIndex, setSelectedSlashCommandsIndex] = useState(0)
		const [slashCommandsQuery, setSlashCommandsQuery] = useState("")
		const slashCommandsMenuContainerRef = useRef<HTMLDivElement>(null)

		const [thumbnailsHeight, setThumbnailsHeight] = useState(0)
		const [textAreaBaseHeight, setTextAreaBaseHeight] = useState<number | undefined>(undefined)
		const [showContextMenu, setShowContextMenu] = useState(false)
		const [cursorPosition, setCursorPosition] = useState(0)
		const [searchQuery, setSearchQuery] = useState("")
		const [isMouseDownOnMenu, setIsMouseDownOnMenu] = useState(false)
		const [selectedMenuIndex, setSelectedMenuIndex] = useState(-1)
		const [selectedType, setSelectedType] = useState<ContextMenuOptionType | null>(null)
		const [justDeletedSpaceAfterMention, setJustDeletedSpaceAfterMention] = useState(false)
		const [justDeletedSpaceAfterSlashCommand, setJustDeletedSpaceAfterSlashCommand] = useState(false)
		const [intendedCursorPosition, setIntendedCursorPosition] = useState<number | null>(null)
		const contextMenuContainerRef = useRef<HTMLDivElement>(null)

		const { highlightLayerRef, textAreaRef, updateHighlights } = useTextHighlight({
			inputValue,
			localWorkflowToggles,
			globalWorkflowToggles,
			remoteWorkflowToggles,
			remoteGlobalWorkflows: remoteConfigSettings?.remoteGlobalWorkflows,
		})

		const modelSelectorRef = useRef<HTMLDivElement>(null)
		const { width: viewportWidth, height: viewportHeight } = useWindowSize()
		const buttonRef = useRef<HTMLDivElement>(null)
		const [_arrowPosition, setArrowPosition] = useState(0)
		const [_menuPosition, setMenuPosition] = useState(0)
		const [pendingInsertions, setPendingInsertions] = useState<string[]>([])

		const [fileSearchResults, setFileSearchResults] = useState<SearchResult[]>([])
		const [searchLoading, setSearchLoading] = useState(false)
		const [, metaKeyChar] = useMetaKeyDetection(platform)

		const {
			isDraggingOver,
			showUnsupportedFileError,
			showDimensionError,
			handlePaste,
			handleDragEnter,
			onDragOver,
			handleDragLeave,
			onDrop,
		} = useChatAttachments({
			inputValue,
			cursorPosition,
			selectedImages,
			selectedFiles,
			shouldDisableFilesAndImages,
			setInputValue,
			setCursorPosition,
			setIntendedCursorPosition,
			setSelectedImages,
			setShowContextMenu,
			textAreaRef,
			setPendingInsertions,
		})

		// Fetch git commits when Git is selected or when typing a hash
		useEffect(() => {
			if (selectedType === ContextMenuOptionType.Git || /^[a-f0-9]+$/i.test(searchQuery)) {
				FileServiceClient.searchCommits(StringRequest.create({ value: searchQuery || "" }))
					.then((response) => {
						if (response.commits) {
							const commits: GitCommit[] = response.commits.map(
								(commit: { hash: string; shortHash: string; subject: string; author: string; date: string }) => ({
									type: ContextMenuOptionType.Git,
									value: commit.hash,
									label: commit.subject,
									description: `${commit.shortHash} by ${commit.author} on ${commit.date}`,
								}),
							)
							setGitCommits(commits)
						}
					})
					.catch((error) => {
						console.error("Error searching commits:", error)
					})
			}
		}, [selectedType, searchQuery])

		const queryItems = useMemo(() => {
			return [
				{ type: ContextMenuOptionType.Problems, value: "problems" },
				{ type: ContextMenuOptionType.Terminal, value: "terminal" },
				...gitCommits,
			]
		}, [gitCommits])

		useEffect(() => {
			const handleClickOutside = (event: MouseEvent) => {
				if (contextMenuContainerRef.current && !contextMenuContainerRef.current.contains(event.target as Node)) {
					setShowContextMenu(false)
				}
			}

			if (showContextMenu) {
				document.addEventListener("mousedown", handleClickOutside)
			}

			return () => {
				document.removeEventListener("mousedown", handleClickOutside)
			}
		}, [showContextMenu, setShowContextMenu])

		useEffect(() => {
			const handleClickOutsideSlashMenu = (event: MouseEvent) => {
				if (
					slashCommandsMenuContainerRef.current &&
					!slashCommandsMenuContainerRef.current.contains(event.target as Node)
				) {
					setShowSlashCommandsMenu(false)
				}
			}

			if (showSlashCommandsMenu) {
				document.addEventListener("mousedown", handleClickOutsideSlashMenu)
			}

			return () => {
				document.removeEventListener("mousedown", handleClickOutsideSlashMenu)
			}
		}, [showSlashCommandsMenu])

		const handleMentionSelect = useCallback(
			(type: ContextMenuOptionType, value?: string) => {
				if (type === ContextMenuOptionType.NoResults) {
					return
				}

				if (
					type === ContextMenuOptionType.File ||
					type === ContextMenuOptionType.Folder ||
					type === ContextMenuOptionType.Git
				) {
					if (!value) {
						setSelectedType(type)
						setSearchQuery("")
						setSelectedMenuIndex(0)

						// Trigger search with the selected type
						if (type === ContextMenuOptionType.File || type === ContextMenuOptionType.Folder) {
							setSearchLoading(true)

							// Map ContextMenuOptionType to FileSearchType enum
							let searchType: FileSearchType | undefined
							if (type === ContextMenuOptionType.File) {
								searchType = FileSearchType.FILE
							} else if (type === ContextMenuOptionType.Folder) {
								searchType = FileSearchType.FOLDER
							}

							FileServiceClient.searchFiles(
								FileSearchRequest.create({
									query: "",
									mentionsRequestId: "",
									selectedType: searchType,
								}),
							)
								.then((results) => {
									setFileSearchResults((results.results || []) as SearchResult[])
									setSearchLoading(false)
								})
								.catch((error) => {
									console.error("Error searching files:", error)
									setFileSearchResults([])
									setSearchLoading(false)
								})
						}
						return
					}
				}

				setShowContextMenu(false)
				setSelectedType(null)
				const queryLength = searchQuery.length
				setSearchQuery("")

				if (textAreaRef.current) {
					let insertValue = value || ""
					if (type === ContextMenuOptionType.URL) {
						insertValue = value || ""
					} else if (type === ContextMenuOptionType.File || type === ContextMenuOptionType.Folder) {
						insertValue = value || ""
					} else if (type === ContextMenuOptionType.Problems) {
						insertValue = "problems"
					} else if (type === ContextMenuOptionType.Terminal) {
						insertValue = "terminal"
					} else if (type === ContextMenuOptionType.Git) {
						insertValue = value || ""
					}

					const { newValue, mentionIndex } = insertMention(
						textAreaRef.current.value,
						cursorPosition,
						insertValue,
						queryLength,
					)

					setInputValue(newValue)
					const newCursorPosition = newValue.indexOf(" ", mentionIndex + insertValue.length) + 1
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)
					// textAreaRef.current.focus()

					// scroll to cursor
					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			[setInputValue, cursorPosition, searchQuery],
		)

		const handleSlashCommandsSelect = useCallback(
			(command: SlashCommand) => {
				setShowSlashCommandsMenu(false)
				const queryLength = slashCommandsQuery.length
				setSlashCommandsQuery("")

				if (textAreaRef.current) {
					const { newValue, commandIndex } = insertSlashCommand(
						textAreaRef.current.value,
						command.name,
						queryLength,
						cursorPosition,
					)
					const newCursorPosition = newValue.indexOf(" ", commandIndex + 1 + command.name.length) + 1

					setInputValue(newValue)
					setCursorPosition(newCursorPosition)
					setIntendedCursorPosition(newCursorPosition)

					setTimeout(() => {
						if (textAreaRef.current) {
							textAreaRef.current.blur()
							textAreaRef.current.focus()
						}
					}, 0)
				}
			},
			[setInputValue, slashCommandsQuery, cursorPosition],
		)
		const handleKeyDown = useCallback(
			(event: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (showSlashCommandsMenu) {
					if (event.key === "Escape") {
						setShowSlashCommandsMenu(false)
						setSlashCommandsQuery("")
						return
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setSelectedSlashCommandsIndex((prevIndex) => {
							const direction = event.key === "ArrowUp" ? -1 : 1
							// Get commands with workflow toggles
							const allCommands = getMatchingSlashCommands(
								slashCommandsQuery,
								localWorkflowToggles,
								globalWorkflowToggles,
								remoteWorkflowToggles,
								remoteConfigSettings?.remoteGlobalWorkflows,
							)

							if (allCommands.length === 0) {
								return prevIndex
							}

							// Calculate total command count
							const totalCommandCount = allCommands.length

							// Create wraparound navigation - moves from last item to first and vice versa
							const newIndex = (prevIndex + direction + totalCommandCount) % totalCommandCount
							return newIndex
						})
						return
					}

					if ((event.key === "Enter" || event.key === "Tab") && selectedSlashCommandsIndex !== -1) {
						event.preventDefault()
						const commands = getMatchingSlashCommands(
							slashCommandsQuery,
							localWorkflowToggles,
							globalWorkflowToggles,
							remoteWorkflowToggles,
							remoteConfigSettings?.remoteGlobalWorkflows,
						)
						if (commands.length > 0) {
							handleSlashCommandsSelect(commands[selectedSlashCommandsIndex])
						}
						return
					}
				}
				if (showContextMenu) {
					if (event.key === "Escape") {
						setShowContextMenu(false)
						setSelectedType(null)
						setSelectedMenuIndex(DEFAULT_CONTEXT_MENU_OPTION)
						setSearchQuery("")
						return
					}

					if (event.key === "ArrowUp" || event.key === "ArrowDown") {
						event.preventDefault()
						setSelectedMenuIndex((prevIndex) => {
							const direction = event.key === "ArrowUp" ? -1 : 1
							const options = getContextMenuOptions(searchQuery, selectedType, queryItems, fileSearchResults)
							const optionsLength = options.length

							if (optionsLength === 0) {
								return prevIndex
							}

							// Find selectable options (non-URL types)
							const selectableOptions = options.filter(
								(option) =>
									option.type !== ContextMenuOptionType.URL && option.type !== ContextMenuOptionType.NoResults,
							)

							if (selectableOptions.length === 0) {
								return -1 // No selectable options
							}

							// Find the index of the next selectable option
							const currentSelectableIndex = selectableOptions.indexOf(options[prevIndex])

							const newSelectableIndex =
								(currentSelectableIndex + direction + selectableOptions.length) % selectableOptions.length

							// Find the index of the selected option in the original options array
							return options.indexOf(selectableOptions[newSelectableIndex])
						})
						return
					}
					if ((event.key === "Enter" || event.key === "Tab") && selectedMenuIndex !== -1) {
						event.preventDefault()
						const selectedOption = getContextMenuOptions(searchQuery, selectedType, queryItems, fileSearchResults)[
							selectedMenuIndex
						]
						if (
							selectedOption &&
							selectedOption.type !== ContextMenuOptionType.URL &&
							selectedOption.type !== ContextMenuOptionType.NoResults
						) {
							// Use label if it contains workspace prefix, otherwise use value
							const mentionValue = selectedOption.label?.includes(":") ? selectedOption.label : selectedOption.value
							handleMentionSelect(selectedOption.type, mentionValue)
						}
						return
					}
				}

				// Safari does not support InputEvent.isComposing (always false), so we need to fallback to keyCode === 229 for it
				const isComposing = isSafari ? event.nativeEvent.keyCode === 229 : (event.nativeEvent?.isComposing ?? false)
				if (event.key === "Enter" && !event.shiftKey && !isComposing) {
					event.preventDefault()

					if (!sendingDisabled) {
						setIsTextAreaFocused(false)
						onSend()
					}
				}

				if (event.key === "Backspace" && !isComposing) {
					const charBeforeCursor = inputValue[cursorPosition - 1]
					const charAfterCursor = inputValue[cursorPosition + 1]

					const charBeforeIsWhitespace =
						charBeforeCursor === " " || charBeforeCursor === "\n" || charBeforeCursor === "\r\n"
					const charAfterIsWhitespace =
						charAfterCursor === " " || charAfterCursor === "\n" || charAfterCursor === "\r\n"

					// Check if we're right after a space that follows a mention or slash command
					if (
						charBeforeIsWhitespace &&
						inputValue.slice(0, cursorPosition - 1).match(new RegExp(mentionRegex.source + "$"))
					) {
						// File mention handling
						const newCursorPosition = cursorPosition - 1
						if (!charAfterIsWhitespace) {
							event.preventDefault()
							textAreaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
							setCursorPosition(newCursorPosition)
						}
						setCursorPosition(newCursorPosition)
						setJustDeletedSpaceAfterMention(true)
						setJustDeletedSpaceAfterSlashCommand(false)
					} else if (charBeforeIsWhitespace && inputValue.slice(0, cursorPosition - 1).match(slashCommandDeleteRegex)) {
						// New slash command handling
						const newCursorPosition = cursorPosition - 1
						if (!charAfterIsWhitespace) {
							event.preventDefault()
							textAreaRef.current?.setSelectionRange(newCursorPosition, newCursorPosition)
							setCursorPosition(newCursorPosition)
						}
						setCursorPosition(newCursorPosition)
						setJustDeletedSpaceAfterSlashCommand(true)
						setJustDeletedSpaceAfterMention(false)
					}
					// Handle the second backspace press for mentions or slash commands
					else if (justDeletedSpaceAfterMention) {
						const { newText, newPosition } = removeMention(inputValue, cursorPosition)
						if (newText !== inputValue) {
							event.preventDefault()
							setInputValue(newText)
							setIntendedCursorPosition(newPosition)
						}
						setJustDeletedSpaceAfterMention(false)
						setShowContextMenu(false)
					} else if (justDeletedSpaceAfterSlashCommand) {
						// New slash command deletion
						const { newText, newPosition } = removeSlashCommand(inputValue, cursorPosition)
						if (newText !== inputValue) {
							event.preventDefault()
							setInputValue(newText)
							setIntendedCursorPosition(newPosition)
						}
						setJustDeletedSpaceAfterSlashCommand(false)
						setShowSlashCommandsMenu(false)
					}
					// Default case - reset flags if none of the above apply
					else {
						setJustDeletedSpaceAfterMention(false)
						setJustDeletedSpaceAfterSlashCommand(false)
					}
				}
			},
			[
				onSend,
				showContextMenu,
				searchQuery,
				selectedMenuIndex,
				handleMentionSelect,
				selectedType,
				inputValue,
				cursorPosition,
				setInputValue,
				justDeletedSpaceAfterMention,
				queryItems,
				fileSearchResults,
				showSlashCommandsMenu,
				selectedSlashCommandsIndex,
				slashCommandsQuery,
				handleSlashCommandsSelect,
				sendingDisabled,
			],
		)

		// Effect to set cursor position after state updates
		useLayoutEffect(() => {
			if (intendedCursorPosition !== null && textAreaRef.current) {
				textAreaRef.current.setSelectionRange(intendedCursorPosition, intendedCursorPosition)
				setIntendedCursorPosition(null) // Reset the state after applying
			}
		}, [inputValue, intendedCursorPosition])

		useEffect(() => {
			if (pendingInsertions.length === 0 || !textAreaRef.current) {
				return
			}

			const path = pendingInsertions[0]
			const currentTextArea = textAreaRef.current
			const currentValue = currentTextArea.value
			const currentCursorPos =
				intendedCursorPosition ??
				(currentTextArea.selectionStart >= 0 ? currentTextArea.selectionStart : currentValue.length)

			const { newValue, mentionIndex } = insertMentionDirectly(currentValue, currentCursorPos, path)

			setInputValue(newValue)

			const newCursorPosition = mentionIndex + path.length + 2
			setIntendedCursorPosition(newCursorPosition)

			setPendingInsertions((prev) => prev.slice(1))
		}, [pendingInsertions, setInputValue])

		const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

		const currentSearchQueryRef = useRef<string>("")

		const handleInputChange = useCallback(
			(e: React.ChangeEvent<HTMLTextAreaElement>) => {
				const newValue = e.target.value
				const newCursorPosition = e.target.selectionStart
				setInputValue(newValue)
				setCursorPosition(newCursorPosition)
				let showMenu = shouldShowContextMenu(newValue, newCursorPosition)
				const showSlashCommandsMenu = shouldShowSlashCommandsMenu(newValue, newCursorPosition)

				// we do not allow both menus to be shown at the same time
				// the slash commands menu has precedence bc its a narrower component
				if (showSlashCommandsMenu) {
					showMenu = false
				}

				setShowSlashCommandsMenu(showSlashCommandsMenu)
				setShowContextMenu(showMenu)

				if (showSlashCommandsMenu) {
					// Find the slash nearest to cursor (before cursor position)
					const beforeCursor = newValue.slice(0, newCursorPosition)
					const slashIndex = beforeCursor.lastIndexOf("/")
					const query = newValue.slice(slashIndex + 1, newCursorPosition)
					setSlashCommandsQuery(query)
					setSelectedSlashCommandsIndex(0)
				} else {
					setSlashCommandsQuery("")
					setSelectedSlashCommandsIndex(0)
				}

				if (showMenu) {
					const lastAtIndex = newValue.lastIndexOf("@", newCursorPosition - 1)
					const query = newValue.slice(lastAtIndex + 1, newCursorPosition)
					setSearchQuery(query)
					currentSearchQueryRef.current = query

					if (query.length > 0) {
						setSelectedMenuIndex(0)

						// Clear any existing timeout
						if (searchTimeoutRef.current) {
							clearTimeout(searchTimeoutRef.current)
						}

						setSearchLoading(true)

						const searchType =
							selectedType === ContextMenuOptionType.File
								? FileSearchType.FILE
								: selectedType === ContextMenuOptionType.Folder
									? FileSearchType.FOLDER
									: undefined

						// Parse workspace hint from query (e.g., "@frontend:/filename")
						let workspaceHint: string | undefined
						let searchQuery = query
						const workspaceHintMatch = query.match(/^([\w-]+):\/(.*)$/)
						if (workspaceHintMatch) {
							workspaceHint = workspaceHintMatch[1]
							searchQuery = workspaceHintMatch[2]
						}

						// Set a timeout to debounce the search requests
						searchTimeoutRef.current = setTimeout(() => {
							FileServiceClient.searchFiles(
								FileSearchRequest.create({
									query: searchQuery,
									mentionsRequestId: query,
									selectedType: searchType,
									workspaceHint: workspaceHint,
								}),
							)
								.then((results) => {
									setFileSearchResults((results.results || []) as SearchResult[])
									setSearchLoading(false)
								})
								.catch((error) => {
									console.error("Error searching files:", error)
									setFileSearchResults([])
									setSearchLoading(false)
								})
						}, 200) // 200ms debounce
					} else {
						setSelectedMenuIndex(DEFAULT_CONTEXT_MENU_OPTION)
					}
				} else {
					setSearchQuery("")
					setSelectedMenuIndex(-1)
					setFileSearchResults([])
				}
			},
			[setInputValue, setFileSearchResults, selectedType],
		)

		useEffect(() => {
			if (!showContextMenu) {
				setSelectedType(null)
			}
		}, [showContextMenu])

		const handleBlur = useCallback(() => {
			// Only hide the context menu if the user didn't click on it
			if (!isMouseDownOnMenu) {
				setShowContextMenu(false)
				setShowSlashCommandsMenu(false)
			}
			setIsTextAreaFocused(false)
			onFocusChange?.(false) // Call prop on blur
		}, [isMouseDownOnMenu, onFocusChange])

		const handleThumbnailsHeightChange = useCallback((height: number) => {
			setThumbnailsHeight(height)
		}, [])

		useEffect(() => {
			if (selectedImages.length === 0 && selectedFiles.length === 0) {
				setThumbnailsHeight(0)
			}
		}, [selectedImages, selectedFiles])

		const handleMenuMouseDown = useCallback(() => {
			setIsMouseDownOnMenu(true)
		}, [])

		const updateCursorPosition = useCallback(() => {
			if (textAreaRef.current) {
				setCursorPosition(textAreaRef.current.selectionStart)
			}
		}, [])

		const handleKeyUp = useCallback(
			(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
				if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
					updateCursorPosition()
				}
			},
			[updateCursorPosition],
		)

		const { modelDisplayName, switchToMode, onModeToggle } = useModelSelector({
			mode,
			apiConfiguration,
			openRouterModels,
			showModelSelector,
			inputValue,
			selectedImages,
			selectedFiles,
			setInputValue,
			textAreaRef,
		})

		useShortcut(usePlatform().togglePlanActKeys, onModeToggle, { disableTextInputs: false })

		const handleContextButtonClick = useCallback(() => {
			// Focus the textarea first
			textAreaRef.current?.focus()

			// If input is empty, just insert @
			if (!inputValue.trim()) {
				const event = {
					target: {
						value: "@",
						selectionStart: 1,
					},
				} as React.ChangeEvent<HTMLTextAreaElement>
				handleInputChange(event)
				updateHighlights()
				return
			}

			// If input ends with space or is empty, just append @
			if (inputValue.endsWith(" ")) {
				const event = {
					target: {
						value: inputValue + "@",
						selectionStart: inputValue.length + 1,
					},
				} as React.ChangeEvent<HTMLTextAreaElement>
				handleInputChange(event)
				updateHighlights()
				return
			}

			// Otherwise add space then @
			const event = {
				target: {
					value: inputValue + " @",
					selectionStart: inputValue.length + 2,
				},
			} as React.ChangeEvent<HTMLTextAreaElement>
			handleInputChange(event)
			updateHighlights()
		}, [inputValue, handleInputChange, updateHighlights])

		const handleModelButtonClick = () => {
			setShowModelSelector(!showModelSelector)
		}

		// Calculate arrow position and menu position based on button location
		useEffect(() => {
			if (showModelSelector && buttonRef.current) {
				const buttonRect = buttonRef.current.getBoundingClientRect()
				const buttonCenter = buttonRect.left + buttonRect.width / 2

				// Calculate distance from right edge of viewport using viewport coordinates
				const rightPosition = document.documentElement.clientWidth - buttonCenter - 5

				setArrowPosition(rightPosition)
				setMenuPosition(buttonRect.top + 1) // Added +1 to move menu down by 1px
			}
		}, [showModelSelector, viewportWidth, viewportHeight])

		useEffect(() => {
			if (!showModelSelector) {
				// Attempt to save if possible
				// NOTE: we cannot call this here since it will create an infinite loop between this effect and the callback since getLatestState will update state. Instead we should submitapiconfig when the menu is explicitly closed, rather than as an effect of showModelSelector changing.
				// handleApiConfigSubmit()

				// Reset any active styling by blurring the button
				const button = buttonRef.current?.querySelector("a")
				if (button) {
					button.blur()
				}
			}
		}, [showModelSelector])

		return (
			<div>
				<div
					className="relative flex transition-colors ease-in-out duration-100 px-3.5 py-2.5"
					onDragEnter={handleDragEnter}
					onDragLeave={handleDragLeave}
					onDragOver={onDragOver}
					onDrop={onDrop}>
					{/* PulsingBorder removed — replaced with simple mic animation in VoiceRecorder */}

					{showDimensionError && (
						<div className="absolute inset-2.5 bg-[rgba(var(--vscode-errorForeground-rgb),0.1)] border-2 border-error rounded-xs flex items-center justify-center z-10 pointer-events-none">
							<span className="text-error font-bold text-xs text-center">{t("chat.imageTooBig")}</span>
						</div>
					)}
					{showUnsupportedFileError && (
						<div className="absolute inset-2.5 bg-[rgba(var(--vscode-errorForeground-rgb),0.1)] border-2 border-error rounded-xs flex items-center justify-center z-10 pointer-events-none">
							<span className="text-error font-bold text-xs">{t("chat.nonImageDisabled")}</span>
						</div>
					)}
					{showSlashCommandsMenu && (
						<div ref={slashCommandsMenuContainerRef}>
							<SlashCommandMenu
								globalWorkflowToggles={globalWorkflowToggles}
								localWorkflowToggles={localWorkflowToggles}
								onMouseDown={handleMenuMouseDown}
								onSelect={handleSlashCommandsSelect}
								query={slashCommandsQuery}
								remoteWorkflows={remoteConfigSettings?.remoteGlobalWorkflows}
								remoteWorkflowToggles={remoteWorkflowToggles}
								selectedIndex={selectedSlashCommandsIndex}
								setSelectedIndex={setSelectedSlashCommandsIndex}
							/>
						</div>
					)}

					{showContextMenu && (
						<div ref={contextMenuContainerRef}>
							<ContextMenu
								dynamicSearchResults={fileSearchResults}
								isLoading={searchLoading}
								onMouseDown={handleMenuMouseDown}
								onSelect={handleMentionSelect}
								queryItems={queryItems}
								searchQuery={searchQuery}
								selectedIndex={selectedMenuIndex}
								selectedType={selectedType}
								setSelectedIndex={setSelectedMenuIndex}
							/>
						</div>
					)}
					<div
						className={cn(
							"absolute bottom-2.5 top-2.5 whitespace-pre-wrap break-words rounded-xs overflow-hidden bg-input-background",
							isTextAreaFocused || isVoiceRecording
								? "left-3.5 right-3.5"
								: "left-3.5 right-3.5 border border-input-border",
						)}
						ref={highlightLayerRef}
						style={{
							position: "absolute",
							pointerEvents: "none",
							whiteSpace: "pre-wrap",
							wordWrap: "break-word",
							color: "transparent",
							overflow: "hidden",
							fontFamily: "var(--vscode-font-family)",
							fontSize: "var(--vscode-editor-font-size)",
							lineHeight: "var(--vscode-editor-line-height)",
							borderRadius: 2,
							borderLeft: isTextAreaFocused || isVoiceRecording ? 0 : undefined,
							borderRight: isTextAreaFocused || isVoiceRecording ? 0 : undefined,
							borderTop: isTextAreaFocused || isVoiceRecording ? 0 : undefined,
							borderBottom: isTextAreaFocused || isVoiceRecording ? 0 : undefined,
							padding: `9px ${dictationSettings?.dictationEnabled ? "48" : "28"}px ${9 + thumbnailsHeight}px 9px`,
						}}
					/>
					<DynamicTextArea
						autoFocus={true}
						data-testid="chat-input"
						maxRows={10}
						minRows={3}
						onBlur={handleBlur}
						onChange={(e) => {
							handleInputChange(e)
							updateHighlights()
						}}
						onFocus={() => {
							setIsTextAreaFocused(true)
							onFocusChange?.(true) // Call prop on focus
						}}
						onHeightChange={(height) => {
							if (textAreaBaseHeight === undefined || height < textAreaBaseHeight) {
								setTextAreaBaseHeight(height)
							}
							onHeightChange?.(height)
						}}
						onKeyDown={handleKeyDown}
						onKeyUp={handleKeyUp}
						onMouseUp={updateCursorPosition}
						onPaste={handlePaste}
						onScroll={() => updateHighlights()}
						onSelect={updateCursorPosition}
						placeholder={showUnsupportedFileError || showDimensionError ? "" : placeholderText}
						ref={(el) => {
							if (typeof ref === "function") {
								ref(el)
							} else if (ref) {
								ref.current = el
							}
							textAreaRef.current = el
						}}
						style={{
							width: "100%",
							boxSizing: "border-box",
							backgroundColor: "transparent",
							color: "var(--vscode-input-foreground)",
							//border: "1px solid var(--vscode-input-border)",
							borderRadius: 2,
							fontFamily: "var(--vscode-font-family)",
							fontSize: "var(--vscode-editor-font-size)",
							lineHeight: "var(--vscode-editor-line-height)",
							resize: "none",
							overflowX: "hidden",
							overflowY: "scroll",
							scrollbarWidth: "none",
							// Since we have maxRows, when text is long enough it starts to overflow the bottom padding, appearing behind the thumbnails. To fix this, we use a transparent border to push the text up instead. (https://stackoverflow.com/questions/42631947/maintaining-a-padding-inside-of-text-area/52538410#52538410)
							// borderTop: "9px solid transparent",
							borderLeft: 0,
							borderRight: 0,
							borderTop: 0,
							borderBottom: `${thumbnailsHeight}px solid transparent`,
							borderColor: "transparent",
							// borderRight: "54px solid transparent",
							// borderLeft: "9px solid transparent", // NOTE: react-textarea-autosize doesn't calculate correct height when using borderLeft/borderRight so we need to use horizontal padding instead
							// Instead of using boxShadow, we use a div with a border to better replicate the behavior when the textarea is focused
							// boxShadow: "0px 0px 0px 1px var(--vscode-input-border)",
							padding: `9px ${dictationSettings?.dictationEnabled ? "48" : "28"}px 9px 9px`,
							cursor: "text",
							flex: 1,
							zIndex: 1,
							outline:
								isDraggingOver && !showUnsupportedFileError // Only show drag outline if not showing error
									? "2px dashed var(--vscode-focusBorder)"
									: isTextAreaFocused
										? `1px solid ${MODE_COLORS[mode] || "var(--vscode-focusBorder)"}`
										: "none",
							outlineOffset: isDraggingOver && !showUnsupportedFileError ? "1px" : "0px", // Add offset for drag-over outline
						}}
						value={inputValue}
					/>
					{!inputValue && selectedImages.length === 0 && selectedFiles.length === 0 && (
						<div className="text-xs absolute bottom-5 left-6.5 right-16 text-(--vscode-input-placeholderForeground)/50 whitespace-nowrap overflow-hidden text-ellipsis pointer-events-none z-1">
							{t("chat.contextHint")}
						</div>
					)}
					{(selectedImages.length > 0 || selectedFiles.length > 0) && (
						<Thumbnails
							files={selectedFiles}
							images={selectedImages}
							onHeightChange={handleThumbnailsHeightChange}
							setFiles={setSelectedFiles}
							setImages={setSelectedImages}
							style={{
								position: "absolute",
								paddingTop: 4,
								bottom: 14,
								left: 22,
								right: 47, // (54 + 9) + 4 extra padding
								zIndex: 2,
							}}
						/>
					)}
					<div
						className="absolute flex items-end bottom-4.5 right-5 z-10 h-8 text-xs"
						style={{ height: textAreaBaseHeight }}>
						<div className="flex flex-row items-center">
							{dictationSettings?.featureEnabled && (dictationSettings?.dictationEnabled && dictationSettings?.voiceReady ? (
								<VoiceRecorder
									disabled={sendingDisabled}
									isAuthenticated={!!skycodeUser?.uid}
									language={dictationSettings?.dictationLanguage || "en"}
									onAuthRequired={navigateToAccount}
									onProcessingStateChange={(isProcessing, message) => {
										setIsVoiceProcessing(isProcessing)
										if (isProcessing && message) {
											// Show processing message in input
											setInputValue(`${inputValue} [${message}]`.trim())
										}
									}}
									onRecordingStateChange={setIsVoiceRecording}
									onTranscription={(text) => {
										// Remove any processing text first
										const processingPattern = /\s*\[Transcribing\.\.\.\]$/
										const cleanedValue = inputValue.replace(processingPattern, "")

										if (!text) {
											setInputValue(cleanedValue)
											return
										}

										// Append the transcribed text to the cleaned input
										const newValue = cleanedValue + (cleanedValue ? " " : "") + text
										setInputValue(newValue)
										// Focus the textarea and move cursor to end
										setTimeout(() => {
											if (textAreaRef.current) {
												textAreaRef.current.focus()
												const length = newValue.length
												textAreaRef.current.setSelectionRange(length, length)
											}
										}, 0)
									}}
								/>
							) : (
								/* Inactive mic — click opens Voice settings */
								<Tooltip>
									<TooltipTrigger asChild>
										<div
											className="pt-1 input-icon-button mr-1.5 text-base mt-0.5 opacity-40 cursor-pointer"
											onClick={() => navigateToSettings("voice")}>
											<span className="codicon codicon-mic" />
										</div>
									</TooltipTrigger>
									<TooltipContent side="top">{t("voice.setupRequired")}</TooltipContent>
								</Tooltip>
							))}
						{isAiWorking ? (
									<div
										className={cn("input-icon-button", "codicon codicon-debug-stop text-sm text-description hover:text-foreground")}
										data-testid="stop-button"
										onClick={() => {
											if (onCancel) {
												onCancel()
											} else {
												TaskServiceClient.cancelTask(EmptyRequest.create({})).catch((err) => {
													console.error("[Stop] cancelTask failed:", err)
												})
											}
										}}
										title={t("chat.stopAI")}
									/>
								) : (
								// Кнопка Send — disabled при записи голоса и транскрипции
									<div
										className={cn(
											"input-icon-button",
										{ disabled: sendingDisabled || isVoiceRecording || isVoiceProcessing },
											"codicon codicon-send text-sm",
										)}
										data-testid="send-button"
										onClick={() => {
										if (!sendingDisabled && !isVoiceRecording && !isVoiceProcessing) {
												setIsTextAreaFocused(false)
												onSend()
											}
										}}
									/>
							)}
						</div>
					</div>
				</div>
				<div className="flex justify-between items-center -mt-[2px] px-3 pb-2">
					{/* Always render both components, but control visibility with CSS */}
					<div className="relative flex-1 min-w-0 h-5">
						{/* ButtonGroup - always in DOM but visibility controlled */}
						<ButtonGroup className="absolute top-0 left-0 right-0 ease-in-out w-full h-5 z-10 flex items-center">
							<Tooltip>
								<TooltipContent>{t("chat.addContext")}</TooltipContent>
								<TooltipTrigger>
									<VSCodeButton
										appearance="icon"
										aria-label={t("chat.addContext")}
										className="p-0 m-0 flex items-center"
										data-testid="context-button"
										onClick={handleContextButtonClick}>
										<ButtonContainer>
											<AtSignIcon size={12} />
										</ButtonContainer>
									</VSCodeButton>
								</TooltipTrigger>
							</Tooltip>

							<Tooltip>
								<TooltipContent>{t("chat.addFiles")}</TooltipContent>
								<TooltipTrigger>
									<VSCodeButton
										appearance="icon"
										aria-label={t("chat.addFiles")}
										className="p-0 m-0 flex items-center"
										data-testid="files-button"
										disabled={shouldDisableFilesAndImages}
										onClick={() => {
											if (!shouldDisableFilesAndImages) {
												onSelectFilesAndImages()
											}
										}}>
										<ButtonContainer>
											<PlusIcon size={13} />
										</ButtonContainer>
									</VSCodeButton>
								</TooltipTrigger>
							</Tooltip>

							<ServersToggleModal />

							<SkycodeRulesToggleModal />

							<ModelContainer ref={modelSelectorRef}>
								<ModelPickerModal
									currentMode={mode}
									isOpen={showModelSelector}
									onOpenChange={setShowModelSelector}>
									<ModelButtonWrapper ref={buttonRef}>
										<ModelDisplayButton
											disabled={false}
											isActive={showModelSelector}
											onClick={handleModelButtonClick}
											role="button"
											tabIndex={0}
											title={t("chat.selectModel")}>
											<ModelButtonContent className="text-xs">{modelDisplayName}</ModelButtonContent>
										</ModelDisplayButton>
									</ModelButtonWrapper>
								</ModelPickerModal>
							</ModelContainer>
						</ButtonGroup>
					</div>
					{/* Mode selector (Plan / Act / Ask / Debug) */}
					<ModeSwitcher mode={mode} onSwitchMode={switchToMode} />
				</div>
			</div>
		)
	},
)

export default ChatTextArea
