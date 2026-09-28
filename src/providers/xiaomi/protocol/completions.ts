export type MimoModel = string;
export type ThinkingType = "enabled" | "disabled";

export type FinishReason =
	| "stop"
	| "length"
	| "tool_calls"
	| "content_filter"
	| "repetition_truncation";

export interface MimoThinking {
	type: ThinkingType;
}

export interface MimoFunctionDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	strict?: boolean;
}

export interface MimoTool {
	type: "function";
	function: MimoFunctionDefinition;
}

export interface MimoWebSearchTool {
	type: "web_search";
	max_keyword?: number;
	force_search?: boolean;
	limit?: number;
	user_location?: {
		type?: "approximate";
		country?: string;
		region?: string;
		city?: string;
		timezone?: string;
	};
}

export type MimoToolDefinition = MimoTool | MimoWebSearchTool;

export type MimoToolChoice = "auto";

export interface MimoMessageToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface MimoSystemMessage {
	role: "system";
	content: string;
	name?: string;
}

export interface MimoUserMessage {
	role: "user";
	content: string;
	name?: string;
}

export interface MimoAssistantMessage {
	role: "assistant";
	content?: string | null;
	name?: string;
	reasoning_content?: string | null;
	annotations?: MimoAnnotation[];
	tool_calls?: MimoMessageToolCall[];
}

export interface MimoToolMessage {
	role: "tool";
	content: string;
	tool_call_id: string;
}

export type MimoMessage =
	| MimoSystemMessage
	| MimoUserMessage
	| MimoAssistantMessage
	| MimoToolMessage;

export interface ChatCompletionRequest {
	model: MimoModel;
	messages: MimoMessage[];
	thinking?: MimoThinking;
	max_completion_tokens?: number;
	response_format?: { type: "text" | "json_object" };
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	temperature?: number;
	top_p?: number;
	tools?: MimoToolDefinition[];
	tool_choice?: MimoToolChoice;
	user_id?: string;
}

export interface MimoUrlCitationAnnotation {
	type: "url_citation";
	url: string;
	title?: string;
	summary?: string;
	site_name?: string;
	publish_time?: string;
	logo_url?: string;
}

export type MimoAnnotation = MimoUrlCitationAnnotation;

export interface CompletionUsage {
	prompt_tokens: number;
	completion_tokens: number;
	total_tokens: number;
	prompt_tokens_details?: {
		cached_tokens?: number;
		audio_tokens?: number;
		image_tokens?: number;
		video_tokens?: number;
	};
	completion_tokens_details?: {
		reasoning_tokens?: number;
	};
	web_search_usage?: {
		tool_usage?: number;
		page_usage?: number;
	};
}

export interface ChatCompletionChoice {
	index: number;
	finish_reason?: FinishReason;
	message: MimoAssistantMessage;
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
