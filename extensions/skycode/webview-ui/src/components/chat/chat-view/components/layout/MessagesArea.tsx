import { SkycodeMessage } from "@shared/ExtensionMessage"
import React, { useCallback, useMemo } from "react"
import { Virtuoso } from "react-virtuoso"
import { ChatState, MessageHandlers, ScrollBehavior } from "../../types/chatTypes"
import { TurnData } from "../../utils/messageUtils"
import { TurnBlock } from "../messages/TurnBlock"

interface MessagesAreaProps {
	task: SkycodeMessage
	turns: TurnData[]
	modifiedMessages: SkycodeMessage[]
	scrollBehavior: ScrollBehavior
	chatState: ChatState
	messageHandlers: MessageHandlers
}

/**
 * Chat scroll area with a virtualized list of TurnBlocks.
 *
 * Each TurnBlock = one user message (sticky header) + AI responses.
 * Sticky headers are pure CSS — no JS overlay, no translateY hacks.
 *
 * Footer is always 100vh — gives Virtuoso enough space to scroll
 * any message to the top (Cursor-like "message at top" behavior).
 * Footer height NEVER changes — no Virtuoso re-layout — no jumps.
 *
 * increaseViewportBy uses large but finite pixel values (not MAX_SAFE_INTEGER) so
 * list boundary math in react-virtuoso stays stable; still enough overscan for tall turns.
 */
const VIEWPORT_OVERSCAN_TOP_PX = 4_000
const VIEWPORT_OVERSCAN_BOTTOM_PX = 20_000

export const MessagesArea: React.FC<MessagesAreaProps> = ({
	task,
	turns,
	modifiedMessages,
	scrollBehavior,
	chatState,
	messageHandlers,
}) => {
	const {
		virtuosoRef,
		scrollContainerRef,
		toggleRowExpansion,
		handleRowHeightChange,
		handleRangeChanged,
		onScrollerRef,
	} = scrollBehavior

	// Static large footer — always 100vh, never changes.
	const VirtuosoFooter = useMemo(
		() =>
			function Footer() {
				return <div style={{ minHeight: "100vh" }} />
			},
		[],
	)

	const { expandedRows, inputValue, setActiveQuote } = chatState

	const itemContent = useCallback(
		(index: number, turn: TurnData) => (
			<TurnBlock
				expandedRows={expandedRows}
				inputValue={inputValue}
				messageHandlers={messageHandlers}
				modifiedMessages={modifiedMessages}
				onHeightChange={handleRowHeightChange}
				onSetQuote={setActiveQuote}
				onToggleExpand={toggleRowExpansion}
				totalTurns={turns.length}
				turn={turn}
				turnIndex={index}
			/>
		),
		[
			turns.length,
			modifiedMessages,
			expandedRows,
			toggleRowExpansion,
			handleRowHeightChange,
			setActiveQuote,
			inputValue,
			messageHandlers,
		],
	)

	return (
		<div className="overflow-hidden flex flex-col h-full relative">
			<div className="grow flex" ref={(node) => {
				(scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
			}}>
				<Virtuoso
					className="scrollable grow overflow-y-scroll"
					components={{
						Footer: VirtuosoFooter,
					}}
					computeItemKey={(index, turn) => turn.userMessage.ts}
					data={turns}
					increaseViewportBy={{
						top: VIEWPORT_OVERSCAN_TOP_PX,
						bottom: VIEWPORT_OVERSCAN_BOTTOM_PX,
					}}
					initialTopMostItemIndex={Math.max(0, turns.length - 1)}
					itemContent={itemContent}
					key={task.ts}
					rangeChanged={handleRangeChanged}
					ref={virtuosoRef}
					scrollerRef={onScrollerRef}
					skipAnimationFrameInResizeObserver
					style={{
						scrollbarWidth: "none",
						msOverflowStyle: "none",
						overflowAnchor: "none",
					}}
				/>
			</div>
		</div>
	)
}
