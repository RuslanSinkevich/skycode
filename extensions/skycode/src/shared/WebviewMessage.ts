export interface WebviewMessage {
	type: "grpc_request" | "grpc_request_cancel" | "executeVsCodeCommand" | "updateIndexingConfig" | "indexingCommand"
	grpc_request?: GrpcRequest
	grpc_request_cancel?: GrpcCancel
	// Dev tools: execute VS Code command directly
	executeVsCodeCommand?: {
		command: string
		args?: any[]
	}
	// Indexing: update config settings
	indexingConfigUpdate?: {
		key: string
		value: any
	}
	// Indexing: execute command
	indexingCommandAction?: "reindex" | "clear" | "pause" | "resume"
}

export type GrpcRequest = {
	service: string
	method: string
	message: any // JSON serialized protobuf message
	request_id: string // For correlating requests and responses
	is_streaming: boolean // Whether this is a streaming request
}

export type GrpcCancel = {
	request_id: string // ID of the request to cancel
}

export type SkycodeAskResponse = "yesButtonClicked" | "noButtonClicked" | "messageResponse"

export type SkycodeCheckpointRestore = "task" | "workspace" | "taskAndWorkspace"

export type TaskFeedbackType = "thumbs_up" | "thumbs_down"
