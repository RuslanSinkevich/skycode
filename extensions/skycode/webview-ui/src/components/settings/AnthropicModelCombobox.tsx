import { VSCodeTextField } from "@vscode/webview-ui-toolkit/react"
import Fuse from "fuse.js"
import React, { KeyboardEvent, memo, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { useI18n } from "@/i18n"
import { highlight } from "../history/HistoryView"

export const ANTHROPIC_MODEL_COMBOBOX_Z_INDEX = 1_001

export interface AnthropicModelComboboxProps {
	/** Built-in catalog ids (for search suggestions only) */
	presetModelIds: string[]
	selectedModelId: string
	onModelChange: (modelId: string) => void
	placeholder?: string
}

/**
 * Single text field + dropdown: type any model id (custom proxy alias) or pick from presets.
 */
const AnthropicModelCombobox: React.FC<AnthropicModelComboboxProps> = ({
	presetModelIds,
	selectedModelId,
	onModelChange,
	placeholder,
}) => {
	const { t } = useI18n()
	const [searchTerm, setSearchTerm] = useState(selectedModelId || "")
	const [isDropdownVisible, setIsDropdownVisible] = useState(false)
	const [selectedIndex, setSelectedIndex] = useState(-1)
	const dropdownRef = useRef<HTMLDivElement>(null)
	const itemRefs = useRef<(HTMLDivElement | null)[]>([])
	const dropdownListRef = useRef<HTMLDivElement>(null)
	/** While the field is focused, do not overwrite local text from stale extension state (async save). */
	const inputFocusedRef = useRef(false)
	const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
	const draftRef = useRef(selectedModelId || "")

	const clearPersistTimer = () => {
		if (persistTimerRef.current !== undefined) {
			clearTimeout(persistTimerRef.current)
			persistTimerRef.current = undefined
		}
	}

	/** Persist after idle typing — avoids N concurrent handleFieldChange calls on stale apiConfiguration. */
	const queuePersist = (value: string) => {
		clearPersistTimer()
		persistTimerRef.current = setTimeout(() => {
			persistTimerRef.current = undefined
			onModelChange(value.trim())
		}, 400)
	}

	/** Apply a final model id immediately (preset pick, Enter, clear). */
	const commitModelId = (newModelId: string) => {
		clearPersistTimer()
		draftRef.current = newModelId
		onModelChange(newModelId)
		setSearchTerm(newModelId)
	}

	const handleModelChange = (newModelId: string) => {
		commitModelId(newModelId)
	}

	useEffect(() => {
		return () => {
			clearPersistTimer()
		}
	}, [])

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
				setIsDropdownVisible(false)
			}
		}

		document.addEventListener("mousedown", handleClickOutside)
		return () => {
			document.removeEventListener("mousedown", handleClickOutside)
		}
	}, [])

	const searchableItems = useMemo(() => {
		return presetModelIds.map((id) => ({
			id,
			html: id,
		}))
	}, [presetModelIds])

	const fuse = useMemo(() => {
		return new Fuse(searchableItems, {
			keys: ["html"],
			threshold: 0.35,
			shouldSort: true,
			isCaseSensitive: false,
			ignoreLocation: false,
			includeMatches: true,
			minMatchCharLength: 1,
		})
	}, [searchableItems])

	const modelSearchResults = useMemo(() => {
		return searchTerm ? highlight(fuse.search(searchTerm), "anthropic-model-item-highlight") : searchableItems
	}, [searchableItems, searchTerm, fuse])

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (!isDropdownVisible) {
			if (event.key === "ArrowDown") {
				setIsDropdownVisible(true)
			}
			return
		}

		switch (event.key) {
			case "ArrowDown":
				event.preventDefault()
				setSelectedIndex((prev) => (prev < modelSearchResults.length - 1 ? prev + 1 : prev))
				break
			case "ArrowUp":
				event.preventDefault()
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
				break
			case "Enter":
				event.preventDefault()
				if (selectedIndex >= 0 && selectedIndex < modelSearchResults.length) {
					handleModelChange(modelSearchResults[selectedIndex].id)
					setIsDropdownVisible(false)
				} else {
					handleModelChange(searchTerm.trim())
					setIsDropdownVisible(false)
				}
				break
			case "Escape":
				setIsDropdownVisible(false)
				setSelectedIndex(-1)
				break
		}
	}

	useEffect(() => {
		setSelectedIndex(-1)
		if (dropdownListRef.current) {
			dropdownListRef.current.scrollTop = 0
		}
	}, [searchTerm])

	useEffect(() => {
		if (selectedIndex >= 0 && itemRefs.current[selectedIndex]) {
			itemRefs.current[selectedIndex]?.scrollIntoView({
				block: "nearest",
				behavior: "smooth",
			})
		}
	}, [selectedIndex])

	useEffect(() => {
		if (inputFocusedRef.current) {
			return
		}
		const next = selectedModelId || ""
		draftRef.current = next
		setSearchTerm(next)
	}, [selectedModelId])

	return (
		<div style={{ width: "100%" }}>
			<style>
				{`
				.anthropic-model-item-highlight {
					background-color: var(--vscode-editor-findMatchHighlightBackground);
					color: inherit;
				}
				`}
			</style>
			<DropdownWrapper ref={dropdownRef}>
				<VSCodeTextField
					id="anthropic-model-search"
					onBlur={() => {
						inputFocusedRef.current = false
						clearPersistTimer()
						const v = draftRef.current.trim()
						onModelChange(v)
						draftRef.current = v
						setSearchTerm(v)
					}}
					onFocus={() => {
						inputFocusedRef.current = true
						setIsDropdownVisible(true)
					}}
					onInput={(e) => {
						const value = (e.target as HTMLInputElement)?.value || ""
						draftRef.current = value
						setSearchTerm(value)
						queuePersist(value)
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder ?? t("provider.searchSelectModel")}
					style={{
						width: "100%",
						zIndex: ANTHROPIC_MODEL_COMBOBOX_Z_INDEX,
						position: "relative",
					}}
					value={searchTerm}>
					{searchTerm ? (
						<div
							aria-label={t("history.clearSearch")}
							className="input-icon-button codicon codicon-close"
							onClick={() => {
								handleModelChange("")
								setIsDropdownVisible(true)
							}}
							slot="end"
							style={{
								display: "flex",
								justifyContent: "center",
								alignItems: "center",
								height: "100%",
							}}
						/>
					) : null}
				</VSCodeTextField>
				{isDropdownVisible && modelSearchResults.length > 0 ? (
					<DropdownList ref={dropdownListRef}>
						{modelSearchResults.map((item, index) => (
							<DropdownItem
								isSelected={index === selectedIndex}
								key={item.id}
								onClick={() => {
									handleModelChange(item.id)
									setIsDropdownVisible(false)
								}}
								onMouseEnter={() => setSelectedIndex(index)}
								ref={(el) => {
									itemRefs.current[index] = el
								}}>
								{/* biome-ignore lint/security/noDangerouslySetInnerHtml: pre-highlighted preset id */}
								<span dangerouslySetInnerHTML={{ __html: item.html }} />
							</DropdownItem>
						))}
					</DropdownList>
				) : null}
			</DropdownWrapper>
		</div>
	)
}

export default memo(AnthropicModelCombobox)

const DropdownWrapper = styled.div`
	position: relative;
	width: 100%;
`

const DropdownList = styled.div`
	position: absolute;
	top: calc(100% - 3px);
	left: 0;
	width: calc(100% - 2px);
	max-height: 220px;
	overflow-y: auto;
	background-color: var(--vscode-dropdown-background);
	border: 1px solid var(--vscode-list-activeSelectionBackground);
	z-index: ${ANTHROPIC_MODEL_COMBOBOX_Z_INDEX - 1};
	border-bottom-left-radius: 3px;
	border-bottom-right-radius: 3px;
`

const DropdownItem = styled.div<{ isSelected: boolean }>`
	padding: 5px 10px;
	cursor: pointer;
	word-break: break-all;
	white-space: normal;

	background-color: ${({ isSelected }) => (isSelected ? "var(--vscode-list-activeSelectionBackground)" : "inherit")};

	&:hover {
		background-color: var(--vscode-list-activeSelectionBackground);
	}
`
