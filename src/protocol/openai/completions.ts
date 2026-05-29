// ============================================================
// OpenAI Chat Completions API — Request & Response Types
// POST /chat/completions
// ============================================================

import type { ChatCompletionsModel } from "./models";
import type {
	AudioFormat,
	AudioVoice,
	ChatCompletionTokenLogprob,
	CompletionUsage,
	FinishReason,
	ImageDetail,
	Metadata,
	PromptCacheRetention,
	ReasoningEffort,
	ResponseFormat,
	SearchContextSize,
	ServiceTier,
	ToolChoiceMode,
	Verbosity,
} from "./shared";

// ============================================================
// Message Content Parts
// ============================================================

export interface ChatCompletionContentPartText {
	type: "text";
	text: string;
}

export interface ChatCompletionContentPartImage {
	type: "image_url";
	image_url: {
		url: string;
		detail?: ImageDetail;
	};
}

export interface ChatCompletionContentPartInputAudio {
	type: "input_audio";
	input_audio: {
		data: string;
		format: "wav" | "mp3";
	};
}

export interface ChatCompletionContentPartFile {
	type: "file";
	file: {
		file_data?: string;
		file_id?: string;
		filename?: string;
	};
}

export interface ChatCompletionContentPartRefusal {
	type: "refusal";
	refusal: string;
}

/** Content parts for user messages (text, image, audio, file). */
export type ChatCompletionContentPart =
	| ChatCompletionContentPartText
	| ChatCompletionContentPartImage
	| ChatCompletionContentPartInputAudio
	| ChatCompletionContentPartFile;

/** Content parts for assistant messages (text or refusal). */
export type ChatCompletionAssistantContentPart =
	| ChatCompletionContentPartText
	| ChatCompletionContentPartRefusal;

// ============================================================
// Tool Calls
// ============================================================

export interface ChatCompletionMessageFunctionToolCall {
	type: "function";
	id: string;
	function: {
		name: string;
		arguments: string;
	};
}

export interface ChatCompletionMessageCustomToolCall {
	type: "custom";
	id: string;
	custom: {
		name: string;
		input: string;
	};
}

export type ChatCompletionMessageToolCall =
	| ChatCompletionMessageFunctionToolCall
	| ChatCompletionMessageCustomToolCall;

// ============================================================
// Message Parameters (Request)
// ============================================================

export interface ChatCompletionDeveloperMessageParam {
	role: "developer";
	content: string | ChatCompletionContentPartText[];
	name?: string;
}

export interface ChatCompletionSystemMessageParam {
	role: "system";
	content: string | ChatCompletionContentPartText[];
	name?: string;
}

export interface ChatCompletionUserMessageParam {
	role: "user";
	content: string | ChatCompletionContentPart[];
	name?: string;
}

export interface ChatCompletionAssistantMessageParam {
	role: "assistant";
	content?: string | ChatCompletionAssistantContentPart[];
	name?: string;
	/** Provider extension used by reasoning-capable chat completion providers. */
	reasoning_content?: string | null;
	refusal?: string;
	audio?: { id: string };
	function_call?: {
		name: string;
		arguments: string;
	};
	tool_calls?: ChatCompletionMessageToolCall[];
}

export interface ChatCompletionToolMessageParam {
	role: "tool";
	content: string | ChatCompletionContentPartText[];
	tool_call_id: string;
}

export interface ChatCompletionFunctionMessageParam {
	role: "function";
	content: string;
	name: string;
}

export type ChatCompletionMessageParam =
	| ChatCompletionDeveloperMessageParam
	| ChatCompletionSystemMessageParam
	| ChatCompletionUserMessageParam
	| ChatCompletionAssistantMessageParam
	| ChatCompletionToolMessageParam
	| ChatCompletionFunctionMessageParam;

// ============================================================
// Tool Definitions (Request)
// ============================================================

export interface FunctionDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	strict?: boolean;
}

export interface ChatCompletionFunctionTool {
	type: "function";
	function: FunctionDefinition;
}

export interface ChatCompletionCustomToolFormatText {
	type: "text";
}

export interface ChatCompletionCustomToolFormatGrammar {
	type: "grammar";
	grammar: {
		definition: string;
		syntax: "lark" | "regex";
	};
}

export type ChatCompletionCustomToolFormat =
	| ChatCompletionCustomToolFormatText
	| ChatCompletionCustomToolFormatGrammar;

export interface ChatCompletionCustomTool {
	type: "custom";
	custom: {
		name: string;
		description?: string;
		format?: ChatCompletionCustomToolFormat;
	};
}

export type ChatCompletionTool =
	| ChatCompletionFunctionTool
	| ChatCompletionCustomTool;

// ============================================================
// Tool Choice
// ============================================================

export interface ChatCompletionAllowedTools {
	mode: "auto" | "required";
	tools: Record<string, unknown>[];
}

export interface ChatCompletionAllowedToolChoice {
	type: "allowed_tools";
	allowed_tools: ChatCompletionAllowedTools;
}

export interface ChatCompletionNamedToolChoice {
	type: "function";
	function: { name: string };
}

export interface ChatCompletionNamedToolChoiceCustom {
	type: "custom";
	custom: { name: string };
}

export type ChatCompletionToolChoiceOption =
	| ToolChoiceMode
	| ChatCompletionAllowedToolChoice
	| ChatCompletionNamedToolChoice
	| ChatCompletionNamedToolChoiceCustom;

// ============================================================
// Audio
// ============================================================

export interface ChatCompletionAudioParam {
	format: AudioFormat;
	voice: string | AudioVoice | { id: string };
}

// ============================================================
// Prediction
// ============================================================

export interface ChatCompletionPredictionContent {
	type: "content";
	content: string | ChatCompletionContentPartText[];
}

// ============================================================
// Function Call (Deprecated)
// ============================================================

export type DeprecatedFunctionCall = "none" | "auto";

export interface ChatCompletionFunctionCallOption {
	name: string;
}

// ============================================================
// Stream Options
// ============================================================

export interface ChatCompletionStreamOptions {
	include_obfuscation?: boolean;
	include_usage?: boolean;
}

export interface ChatCompletionThinking {
	type: "enabled" | "disabled";
	clear_thinking?: boolean;
}

// ============================================================
// Web Search Options
// ============================================================

export interface ChatCompletionWebSearchOptions {
	search_context_size?: SearchContextSize;
	user_location?: {
		type?: "approximate";
		approximate?: {
			city?: string;
			country?: string;
			region?: string;
			timezone?: string;
		};
	};
}

// ============================================================
// Request Body
// ============================================================

export interface ChatCompletionCreateRequest {
	messages: ChatCompletionMessageParam[];
	model: ChatCompletionsModel | (string & {});
	/** Parameters for audio output. Required when modalities includes "audio". */
	audio?: ChatCompletionAudioParam;
	/** Number between -2.0 and 2.0. Positive values penalize new tokens based on frequency. */
	frequency_penalty?: number;
	/** Deprecated. Use tool_choice instead. */
	function_call?: DeprecatedFunctionCall | ChatCompletionFunctionCallOption;
	/** Deprecated. Use tools instead. */
	functions?: {
		name: string;
		description?: string;
		parameters?: Record<string, unknown>;
	}[];
	/** Modify the likelihood of specified tokens appearing. Maps token IDs to bias values from -100 to 100. */
	logit_bias?: Record<number, number>;
	/** Whether to return log probabilities of output tokens. */
	logprobs?: boolean;
	/** Maximum number of tokens that can be generated for a completion. */
	max_completion_tokens?: number;
	/** Deprecated. Use max_completion_tokens instead. */
	max_tokens?: number;
	/** Set of 16 key-value pairs that can be attached to the object. */
	metadata?: Metadata;
	/** Output types the model should generate: ["text"] or ["text", "audio"]. */
	modalities?: ("text" | "audio")[];
	/** How many chat completion choices to generate. Default is 1. */
	n?: number;
	/** Whether to enable parallel function calling during tool use. */
	parallel_tool_calls?: boolean;
	/** Static predicted output content for faster regeneration. */
	prediction?: ChatCompletionPredictionContent;
	/** Number between -2.0 and 2.0. Positive values increase talk about new topics. */
	presence_penalty?: number;
	/** Key for prompt caching optimization. Replaces `user` field. */
	prompt_cache_key?: string;
	/** Retention policy for prompt cache. */
	prompt_cache_retention?: PromptCacheRetention;
	/** Constrains effort on reasoning for reasoning models. */
	reasoning_effort?: ReasoningEffort;
	/** Specifies the format that the model must output. */
	response_format?: ResponseFormat;
	/** Stable identifier for safety / abuse detection. */
	safety_identifier?: string;
	/** If specified, attempt deterministic sampling. */
	seed?: number;
	/** Specifies the processing type for serving the request. */
	service_tier?: ServiceTier;
	/** Up to 4 sequences where the API will stop generating further tokens. */
	stop?: string | string[];
	/** Whether to store the output for model distillation or evals. */
	store?: boolean;
	/** If true, stream the response as server-sent events. */
	stream?: boolean;
	/** Options for streaming response. Only set when stream: true. */
	stream_options?: ChatCompletionStreamOptions;
	/** Sampling temperature, between 0 and 2. */
	temperature?: number;
	/** Controls which (if any) tool is called by the model. */
	tool_choice?: ChatCompletionToolChoiceOption;
	/** A list of tools the model may call. */
	tools?: ChatCompletionTool[];
	/** Number of most likely tokens to return at each token position (0-20). Requires logprobs: true. */
	top_logprobs?: number;
	/** Nucleus sampling probability mass. */
	top_p?: number;
	/** Deprecated. Use prompt_cache_key and safety_identifier instead. */
	user?: string;
	/** Provider extension used by bridge providers for end-user identifiers. */
	user_id?: string;
	/** Provider extension used by bridge providers with boolean reasoning. */
	thinking?: ChatCompletionThinking;
	/** Constrains the verbosity of the model's response. */
	verbosity?: Verbosity;
	/** Web search tool configuration. */
	web_search_options?: ChatCompletionWebSearchOptions;
}

// ============================================================
// Response Types
// ============================================================

export interface ChatCompletionChoiceLogprobs {
	content: ChatCompletionTokenLogprob[] | null;
	refusal: ChatCompletionTokenLogprob[] | null;
}

/** Audio output data. */
export interface ChatCompletionAudio {
	id: string;
	data: string;
	expires_at: number;
	transcript: string;
}

/** URL citation annotation. */
export interface ChatCompletionURLCitation {
	type: "url_citation";
	url_citation: {
		start_index: number;
		end_index: number;
		title: string;
		url: string;
	};
}

export type ChatCompletionAnnotation = ChatCompletionURLCitation;

/** A chat completion message generated by the model. */
export interface ChatCompletionMessage {
	content: string | null;
	refusal: string | null;
	role: "assistant";
	/** Provider extension used by reasoning-capable chat completion providers. */
	reasoning_content?: string | null;
	annotations?: ChatCompletionAnnotation[];
	audio?: ChatCompletionAudio;
	function_call?: {
		name: string;
		arguments: string;
	};
	tool_calls?: ChatCompletionMessageToolCall[];
}

export interface ChatCompletionChoice {
	index: number;
	finish_reason: FinishReason;
	logprobs: ChatCompletionChoiceLogprobs | null;
	message: ChatCompletionMessage;
}

/** The full chat completion response object. */
export interface ChatCompletion {
	id: string;
	object: "chat.completion";
	created: number;
	model: string;
	choices: ChatCompletionChoice[];
	service_tier?: ServiceTier;
	system_fingerprint?: string;
	usage?: CompletionUsage;
}

// ============================================================
// Streaming Types
// ============================================================

export interface ChatCompletionStreamDelta {
	role?: "assistant";
	content?: string | null;
	refusal?: string | null;
	function_call?: {
		name?: string;
		arguments?: string;
	};
	tool_calls?: ChatCompletionMessageToolCall[];
}

export interface ChatCompletionStreamChoice {
	index: number;
	delta: ChatCompletionStreamDelta;
	logprobs: ChatCompletionChoiceLogprobs | null;
	finish_reason: FinishReason | null;
}

export interface ChatCompletionChunk {
	id: string;
	object: "chat.completion.chunk";
	created: number;
	model: string;
	system_fingerprint?: string;
	choices: ChatCompletionStreamChoice[];
	usage?: CompletionUsage | null;
}
