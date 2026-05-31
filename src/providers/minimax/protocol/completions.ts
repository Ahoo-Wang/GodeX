export type MiniMaxModel = string;

export type FinishReason = "stop" | "length" | "tool_calls";

export interface MiniMaxFunctionDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	strict?: boolean;
}

export interface MiniMaxTool {
	type: "function";
	function: MiniMaxFunctionDefinition;
}

export type MiniMaxToolChoice =
	| "none"
	| "auto"
	| "required"
	| { type: "function"; function: { name: string } };

export interface MiniMaxMessageToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface MiniMaxSystemMessage {
	role: "system";
	content: string;
	name?: string;
}

export interface MiniMaxUserMessage {
	role: "user";
	content: string;
	name?: string;
}

export interface MiniMaxReasoningDetail {
	text: string;
}

export interface MiniMaxAssistantMessage {
	role: "assistant";
	content?: string | null;
	name?: string;
	reasoning_content?: string | null;
	reasoning_details?: MiniMaxReasoningDetail[];
	tool_calls?: MiniMaxMessageToolCall[];
}

export interface MiniMaxToolMessage {
	role: "tool";
	content: string;
	tool_call_id: string;
}

export type MiniMaxMessage =
	| MiniMaxSystemMessage
	| MiniMaxUserMessage
	| MiniMaxAssistantMessage
	| MiniMaxToolMessage;

export interface ChatCompletionRequest {
	model: MiniMaxModel;
	messages: MiniMaxMessage[];
	max_completion_tokens?: number;
	response_format?: { type: "text" | "json_object" };
	reasoning_split?: boolean;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	temperature?: number;
	top_p?: number;
	tools?: MiniMaxTool[];
	tool_choice?: MiniMaxToolChoice;
	user_id?: string;
}

export interface CompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	total_characters?: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
	};
	completion_tokens_details?: {
		reasoning_tokens?: number;
	};
}

export interface ChatCompletionChoice {
	index: number;
	finish_reason?: FinishReason;
	message: MiniMaxAssistantMessage;
	logprobs?: unknown;
}

export interface ChatCompletion {
	id: string;
	object?: "chat.completion";
	created: number;
	model: string;
	choices: ChatCompletionChoice[];
	system_fingerprint?: string;
	usage?: CompletionUsage;
}

export interface ChatCompletionStreamDelta {
	role?: "assistant";
	content?: string | null;
	reasoning_content?: string | null;
	reasoning_details?: MiniMaxReasoningDetail[];
	tool_calls?: Array<{
		index?: number;
		id?: string;
		type?: "function";
		function?: { name?: string; arguments?: string };
	}>;
}

export interface ChatCompletionStreamChoice {
	index: number;
	delta: ChatCompletionStreamDelta;
	finish_reason?: FinishReason | null;
	logprobs?: unknown;
}

export interface ChatCompletionChunk {
	id?: string;
	object?: "chat.completion.chunk";
	created?: number;
	model?: string;
	choices: ChatCompletionStreamChoice[];
	system_fingerprint?: string;
	usage?: CompletionUsage | null;
}
