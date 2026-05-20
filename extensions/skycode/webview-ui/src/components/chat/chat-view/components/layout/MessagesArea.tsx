import { SkycodeMessage } from "@shared/ExtensionMessage"
import React, { useCallback } from "react"
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
 * Chat scroll area — native scroll, no Virtuoso.
 *
 * Each TurnBlock = one user message (sticky header) + AI responses.
 * Sticky headers are pure CSS — no JS overlay, no translateY hacks.
 *
 * Footer spacer is SIZED DYNAMICALLY by useScrollBehavior to exactly
 * `clientHeight - lastTurnHeight` (clamped >= 0). That way the natural
 * browser-enforced max scrollTop equals `lastTurn.offsetTop` — the user
 * literally cannot scroll past the pinned last user message, and the
 * pin position is always pixel-accurate.
 */
export const MessagesArea: React.FC<MessagesAreaProps> = ({
	task,
	turns,
	modifiedMessages,
	scrollBehavior,
	chatState,
	messageHandlers,
}) => {
	const {
		scrollContainerRef,
		toggleRowExpansion,
		handleRowHeightChange,
		onScrollerRef,
		onFooterRef,
	} = scrollBehavior

	const { expandedRows, inputValue, setActiveQuote } = chatState

	const scrollerCallbackRef = useCallback(
		(node: HTMLDivElement | null) => {
			;(scrollContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = node
			onScrollerRef(node)
		},
		[scrollContainerRef, onScrollerRef],
	)

	return (
		<div className="overflow-hidden flex flex-col h-full relative">
			<div
				className="scrollable grow overflow-y-auto"
				ref={scrollerCallbackRef}
				style={{
					scrollbarWidth: "none",
					msOverflowStyle: "none",
					overflowAnchor: "none",
				}}>
				{/* Single content wrapper so ResizeObserver in useScrollBehavior tracks growth of the WHOLE conversation, not just the first turn. */}
				<div data-chat-content-wrapper>
					{turns.map((turn, index) => (
						<div data-turn-index={index} key={turn.userMessage.ts}>
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
						</div>
					))}
					{/* Footer spacer — height managed by useScrollBehavior.resizeFooter */}
					<div data-chat-footer-spacer ref={onFooterRef} style={{ minHeight: 0, height: 0 }} />
				</div>
			</div>
		</div>
	)
}
