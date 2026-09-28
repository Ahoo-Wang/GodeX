export type MiniMaxModel = string;

export type FinishReason = "stop" | "length" | "content_filter" | "tool_calls";

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

export interface MiniMaxContentPartText {
	type: "text";
	text: string;
}

export interface MiniMaxContentPartImage {
	type: "image_url";
	image_url: {
		url: string;
		detail?: "low" | "default" | "high";
		max_long_side_pixel?: number;
	};
}

export interface MiniMaxContentPartVideo {
	type: "video_url";
	video_url: {
		url: string;
		detail?: "low" | "default" | "high";
		fps?: number;
		max_long_side_pixel?: number;
	};
}

export type MiniMaxContentPart =
	| MiniMaxContentPartText
	| MiniMaxContentPartImage
	| MiniMaxContentPartVideo;

export interface MiniMaxUserMessage {
	role: "user";
	content: string | MiniMaxContentPart[];
	name?: string;
}

export interface MiniMaxAssistantMessage {
	role: "assistant";
	content?: string | null;
	name?: string;
	reasoning_content?: string | null;
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
	thinking?: MiniMaxThinking;
	reasoning_split?: boolean;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	temperature?: number;
	top_p?: number;
	tools?: MiniMaxTool[];
	tool_choice?: MiniMaxToolChoice;
	user_id?: string;
}

export interface MiniMaxThinking {
	type: "disabled" | "adaptive";
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
