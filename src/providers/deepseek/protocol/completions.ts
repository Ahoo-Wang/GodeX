export type DeepSeekModel = string;
export type ThinkingType = "enabled" | "disabled";
export type DeepSeekReasoningEffort = "high" | "max";

export type FinishReason =
	| "stop"
	| "length"
	| "content_filter"
	| "tool_calls"
	| "insufficient_system_resource";

export interface DeepSeekThinking {
	type: ThinkingType;
}

export interface DeepSeekFunctionDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	strict?: boolean;
}

export interface DeepSeekTool {
	type: "function";
	function: DeepSeekFunctionDefinition;
}

export type DeepSeekToolChoice =
	| "none"
	| "auto"
	| "required"
	| { type: "function"; function: { name: string } };

export interface DeepSeekMessageToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface DeepSeekSystemMessage {
	role: "system";
	content: string;
	name?: string;
}

export interface DeepSeekUserMessage {
	role: "user";
	content: string;
	name?: string;
}

export interface DeepSeekAssistantMessage {
	role: "assistant";
	content?: string | null;
	name?: string;
	reasoning_content?: string | null;
	tool_calls?: DeepSeekMessageToolCall[];
}

export interface DeepSeekToolMessage {
	role: "tool";
	content: string;
	tool_call_id: string;
}

export type DeepSeekMessage =
	| DeepSeekSystemMessage
	| DeepSeekUserMessage
	| DeepSeekAssistantMessage
	| DeepSeekToolMessage;

export interface ChatCompletionRequest {
	model: DeepSeekModel;
	messages: DeepSeekMessage[];
	thinking?: DeepSeekThinking;
	reasoning_effort?: DeepSeekReasoningEffort;
	max_tokens?: number;
	response_format?: { type: "text" | "json_object" };
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	temperature?: number;
	top_p?: number;
	tools?: DeepSeekTool[];
	tool_choice?: DeepSeekToolChoice;
	logprobs?: boolean;
	top_logprobs?: number;
	user_id?: string;
}

export interface CompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_cache_hit_tokens?: number;
	prompt_cache_miss_tokens?: number;
	completion_tokens_details?: { reasoning_tokens?: number };
}

export interface ChatCompletionChoice {
	index: number;
	finish_reason?: FinishReason;
	message: DeepSeekAssistantMessage;
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
