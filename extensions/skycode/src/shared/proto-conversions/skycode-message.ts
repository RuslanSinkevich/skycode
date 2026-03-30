import { SkycodeAsk as AppSkycodeAsk, SkycodeMessage as AppSkycodeMessage, SkycodeSay as AppSkycodeSay } from "@shared/ExtensionMessage"
import { SkycodeAsk, SkycodeMessageType, SkycodeSay, SkycodeMessage as ProtoSkycodeMessage } from "@shared/proto/skycode/ui"

// Helper function to convert SkycodeAsk string to enum
function convertSkycodeAskToProtoEnum(ask: AppSkycodeAsk | undefined): SkycodeAsk | undefined {
	if (!ask) {
		return undefined
	}

	const mapping: Record<AppSkycodeAsk, SkycodeAsk> = {
		followup: SkycodeAsk.FOLLOWUP,
		plan_mode_respond: SkycodeAsk.PLAN_MODE_RESPOND,
		act_mode_respond: SkycodeAsk.ACT_MODE_RESPOND,
		command: SkycodeAsk.COMMAND,
		command_output: SkycodeAsk.COMMAND_OUTPUT,
		completion_result: SkycodeAsk.COMPLETION_RESULT,
		tool: SkycodeAsk.TOOL,
		api_req_failed: SkycodeAsk.API_REQ_FAILED,
		resume_task: SkycodeAsk.RESUME_TASK,
		resume_completed_task: SkycodeAsk.RESUME_COMPLETED_TASK,
		mistake_limit_reached: SkycodeAsk.MISTAKE_LIMIT_REACHED,
		browser_action_launch: SkycodeAsk.BROWSER_ACTION_LAUNCH,
		use_mcp_server: SkycodeAsk.USE_MCP_SERVER,
		new_task: SkycodeAsk.NEW_TASK,
		condense: SkycodeAsk.CONDENSE,
		summarize_task: SkycodeAsk.SUMMARIZE_TASK,
		report_bug: SkycodeAsk.REPORT_BUG,
	}

	const result = mapping[ask]
	if (result === undefined) {
	}
	return result
}

// Helper function to convert SkycodeAsk enum to string
function convertProtoEnumToSkycodeAsk(ask: SkycodeAsk): AppSkycodeAsk | undefined {
	if (ask === SkycodeAsk.UNRECOGNIZED) {
		return undefined
	}

	const mapping: Record<Exclude<SkycodeAsk, SkycodeAsk.UNRECOGNIZED>, AppSkycodeAsk> = {
		[SkycodeAsk.FOLLOWUP]: "followup",
		[SkycodeAsk.PLAN_MODE_RESPOND]: "plan_mode_respond",
		[SkycodeAsk.ACT_MODE_RESPOND]: "act_mode_respond",
		[SkycodeAsk.COMMAND]: "command",
		[SkycodeAsk.COMMAND_OUTPUT]: "command_output",
		[SkycodeAsk.COMPLETION_RESULT]: "completion_result",
		[SkycodeAsk.TOOL]: "tool",
		[SkycodeAsk.API_REQ_FAILED]: "api_req_failed",
		[SkycodeAsk.RESUME_TASK]: "resume_task",
		[SkycodeAsk.RESUME_COMPLETED_TASK]: "resume_completed_task",
		[SkycodeAsk.MISTAKE_LIMIT_REACHED]: "mistake_limit_reached",
		[SkycodeAsk.BROWSER_ACTION_LAUNCH]: "browser_action_launch",
		[SkycodeAsk.USE_MCP_SERVER]: "use_mcp_server",
		[SkycodeAsk.NEW_TASK]: "new_task",
		[SkycodeAsk.CONDENSE]: "condense",
		[SkycodeAsk.SUMMARIZE_TASK]: "summarize_task",
		[SkycodeAsk.REPORT_BUG]: "report_bug",
	}

	return mapping[ask]
}

// Helper function to convert SkycodeSay string to enum
function convertSkycodeSayToProtoEnum(say: AppSkycodeSay | undefined): SkycodeSay | undefined {
	if (!say) {
		return undefined
	}

	const mapping: Record<AppSkycodeSay, SkycodeSay> = {
		task: SkycodeSay.TASK,
		error: SkycodeSay.ERROR,
		api_req_started: SkycodeSay.API_REQ_STARTED,
		api_req_finished: SkycodeSay.API_REQ_FINISHED,
		text: SkycodeSay.TEXT,
		reasoning: SkycodeSay.REASONING,
		completion_result: SkycodeSay.COMPLETION_RESULT_SAY,
		user_feedback: SkycodeSay.USER_FEEDBACK,
		user_feedback_diff: SkycodeSay.USER_FEEDBACK_DIFF,
		api_req_retried: SkycodeSay.API_REQ_RETRIED,
		command: SkycodeSay.COMMAND_SAY,
		command_output: SkycodeSay.COMMAND_OUTPUT_SAY,
		tool: SkycodeSay.TOOL_SAY,
		shell_integration_warning: SkycodeSay.SHELL_INTEGRATION_WARNING,
		shell_integration_warning_with_suggestion: SkycodeSay.SHELL_INTEGRATION_WARNING,
		browser_action_launch: SkycodeSay.BROWSER_ACTION_LAUNCH_SAY,
		browser_action: SkycodeSay.BROWSER_ACTION,
		browser_action_result: SkycodeSay.BROWSER_ACTION_RESULT,
		mcp_server_request_started: SkycodeSay.MCP_SERVER_REQUEST_STARTED,
		mcp_server_response: SkycodeSay.MCP_SERVER_RESPONSE,
		mcp_notification: SkycodeSay.MCP_NOTIFICATION,
		use_mcp_server: SkycodeSay.USE_MCP_SERVER_SAY,
		diff_error: SkycodeSay.DIFF_ERROR,
		deleted_api_reqs: SkycodeSay.DELETED_API_REQS,
		skycodeignore_error: SkycodeSay.SKYCODEIGNORE_ERROR,
		command_permission_denied: SkycodeSay.COMMAND_PERMISSION_DENIED,
		checkpoint_created: SkycodeSay.CHECKPOINT_CREATED,
		load_mcp_documentation: SkycodeSay.LOAD_MCP_DOCUMENTATION,
		info: SkycodeSay.INFO,
		task_progress: SkycodeSay.TASK_PROGRESS,
		error_retry: SkycodeSay.ERROR_RETRY,
		hook_status: SkycodeSay.HOOK_STATUS,
		hook_output_stream: SkycodeSay.HOOK_OUTPUT_STREAM,
		conditional_rules_applied: SkycodeSay.CONDITIONAL_RULES_APPLIED,
		generate_explanation: SkycodeSay.GENERATE_EXPLANATION,
		workflow_step_start: SkycodeSay.WORKFLOW_STEP_START,
	}

	const result = mapping[say]

	return result
}

// Helper function to convert SkycodeSay enum to string
function convertProtoEnumToSkycodeSay(say: SkycodeSay): AppSkycodeSay | undefined {
	if (say === SkycodeSay.UNRECOGNIZED) {
		return undefined
	}

	const mapping: Record<Exclude<SkycodeSay, SkycodeSay.UNRECOGNIZED>, AppSkycodeSay> = {
		[SkycodeSay.TASK]: "task",
		[SkycodeSay.ERROR]: "error",
		[SkycodeSay.API_REQ_STARTED]: "api_req_started",
		[SkycodeSay.API_REQ_FINISHED]: "api_req_finished",
		[SkycodeSay.TEXT]: "text",
		[SkycodeSay.REASONING]: "reasoning",
		[SkycodeSay.COMPLETION_RESULT_SAY]: "completion_result",
		[SkycodeSay.USER_FEEDBACK]: "user_feedback",
		[SkycodeSay.USER_FEEDBACK_DIFF]: "user_feedback_diff",
		[SkycodeSay.API_REQ_RETRIED]: "api_req_retried",
		[SkycodeSay.COMMAND_SAY]: "command",
		[SkycodeSay.COMMAND_OUTPUT_SAY]: "command_output",
		[SkycodeSay.TOOL_SAY]: "tool",
		[SkycodeSay.SHELL_INTEGRATION_WARNING]: "shell_integration_warning",
		[SkycodeSay.BROWSER_ACTION_LAUNCH_SAY]: "browser_action_launch",
		[SkycodeSay.BROWSER_ACTION]: "browser_action",
		[SkycodeSay.BROWSER_ACTION_RESULT]: "browser_action_result",
		[SkycodeSay.MCP_SERVER_REQUEST_STARTED]: "mcp_server_request_started",
		[SkycodeSay.MCP_SERVER_RESPONSE]: "mcp_server_response",
		[SkycodeSay.MCP_NOTIFICATION]: "mcp_notification",
		[SkycodeSay.USE_MCP_SERVER_SAY]: "use_mcp_server",
		[SkycodeSay.DIFF_ERROR]: "diff_error",
		[SkycodeSay.DELETED_API_REQS]: "deleted_api_reqs",
		[SkycodeSay.SKYCODEIGNORE_ERROR]: "skycodeignore_error",
		[SkycodeSay.COMMAND_PERMISSION_DENIED]: "command_permission_denied",
		[SkycodeSay.CHECKPOINT_CREATED]: "checkpoint_created",
		[SkycodeSay.LOAD_MCP_DOCUMENTATION]: "load_mcp_documentation",
		[SkycodeSay.INFO]: "info",
		[SkycodeSay.TASK_PROGRESS]: "task_progress",
		[SkycodeSay.ERROR_RETRY]: "error_retry",
		[SkycodeSay.GENERATE_EXPLANATION]: "generate_explanation",
		[SkycodeSay.HOOK_STATUS]: "hook_status",
		[SkycodeSay.HOOK_OUTPUT_STREAM]: "hook_output_stream",
		[SkycodeSay.CONDITIONAL_RULES_APPLIED]: "conditional_rules_applied",
		[SkycodeSay.WORKFLOW_STEP_START]: "workflow_step_start",
	}

	return mapping[say]
}

/**
 * Convert application SkycodeMessage to proto SkycodeMessage
 */
export function convertSkycodeMessageToProto(message: AppSkycodeMessage): ProtoSkycodeMessage {
	// For sending messages, we need to provide values for required proto fields
	const askEnum = message.ask ? convertSkycodeAskToProtoEnum(message.ask) : undefined
	const sayEnum = message.say ? convertSkycodeSayToProtoEnum(message.say) : undefined

	// Determine appropriate enum values based on message type
	let finalAskEnum: SkycodeAsk = SkycodeAsk.FOLLOWUP // Proto default
	let finalSayEnum: SkycodeSay = SkycodeSay.TEXT // Proto default

	if (message.type === "ask") {
		finalAskEnum = askEnum ?? SkycodeAsk.FOLLOWUP // Use FOLLOWUP as default for ask messages
	} else if (message.type === "say") {
		finalSayEnum = sayEnum ?? SkycodeSay.TEXT // Use TEXT as default for say messages
	}

	const protoMessage: ProtoSkycodeMessage = {
		ts: message.ts,
		type: message.type === "ask" ? SkycodeMessageType.ASK : SkycodeMessageType.SAY,
		ask: finalAskEnum,
		say: finalSayEnum,
		text: message.text ?? "",
		reasoning: message.reasoning ?? "",
		images: message.images ?? [],
		files: message.files ?? [],
		partial: message.partial ?? false,
		lastCheckpointHash: message.lastCheckpointHash ?? "",
		isCheckpointCheckedOut: message.isCheckpointCheckedOut ?? false,
		isOperationOutsideWorkspace: message.isOperationOutsideWorkspace ?? false,
		conversationHistoryIndex: message.conversationHistoryIndex ?? 0,
		conversationHistoryDeletedRange: message.conversationHistoryDeletedRange
			? {
					startIndex: message.conversationHistoryDeletedRange[0],
					endIndex: message.conversationHistoryDeletedRange[1],
				}
			: undefined,
		// Additional optional fields for specific ask/say types
		sayTool: undefined,
		sayBrowserAction: undefined,
		browserActionResult: undefined,
		askUseMcpServer: undefined,
		planModeResponse: undefined,
		askQuestion: undefined,
		askNewTask: undefined,
		apiReqInfo: undefined,
		modelInfo: message.modelInfo ?? undefined,
	}

	return protoMessage
}

/**
 * Convert proto SkycodeMessage to application SkycodeMessage
 */
export function convertProtoToSkycodeMessage(protoMessage: ProtoSkycodeMessage): AppSkycodeMessage {
	const message: AppSkycodeMessage = {
		ts: protoMessage.ts,
		type: protoMessage.type === SkycodeMessageType.ASK ? "ask" : "say",
	}

	// Convert ask enum to string
	if (protoMessage.type === SkycodeMessageType.ASK) {
		const ask = convertProtoEnumToSkycodeAsk(protoMessage.ask)
		if (ask !== undefined) {
			message.ask = ask
		}
	}

	// Convert say enum to string
	if (protoMessage.type === SkycodeMessageType.SAY) {
		const say = convertProtoEnumToSkycodeSay(protoMessage.say)
		if (say !== undefined) {
			message.say = say
		}
	}

	// Convert other fields - preserve empty strings as they may be intentional
	if (protoMessage.text !== "") {
		message.text = protoMessage.text
	}
	if (protoMessage.reasoning !== "") {
		message.reasoning = protoMessage.reasoning
	}
	if (protoMessage.images.length > 0) {
		message.images = protoMessage.images
	}
	if (protoMessage.files.length > 0) {
		message.files = protoMessage.files
	}
	if (protoMessage.partial) {
		message.partial = protoMessage.partial
	}
	if (protoMessage.lastCheckpointHash !== "") {
		message.lastCheckpointHash = protoMessage.lastCheckpointHash
	}
	if (protoMessage.isCheckpointCheckedOut) {
		message.isCheckpointCheckedOut = protoMessage.isCheckpointCheckedOut
	}
	if (protoMessage.isOperationOutsideWorkspace) {
		message.isOperationOutsideWorkspace = protoMessage.isOperationOutsideWorkspace
	}
	if (protoMessage.conversationHistoryIndex !== 0) {
		message.conversationHistoryIndex = protoMessage.conversationHistoryIndex
	}

	// Convert conversationHistoryDeletedRange from object to tuple
	if (protoMessage.conversationHistoryDeletedRange) {
		message.conversationHistoryDeletedRange = [
			protoMessage.conversationHistoryDeletedRange.startIndex,
			protoMessage.conversationHistoryDeletedRange.endIndex,
		]
	}

	return message
}
