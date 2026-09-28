import type { ResponsesModel } from "../models";
import type {
	Metadata,
	PromptCacheRetention,
	ReasoningEffort,
	ReasoningSummary,
	ResponseFormatTextConfig,
	ServiceTier,
	TruncationStrategy,
	Verbosity,
} from "../shared";
import type { ResponseInputContent } from "./content";
import type { ResponseItem } from "./items";
import type { InputItemBase } from "./messages";
import type { ResponseTool, ResponseToolChoice } from "./tools";

export type ResponseIncludable =
	| "file_search_call.results"
	| "web_search_call.results"
	| "web_search_call.action.sources"
	| "message.input_image.image_url"
	| "computer_call_output.output.image_url"
	| "code_interpreter_call.outputs"
	| "reasoning.encrypted_content"
	| "message.output_text.logprobs";

export interface ResponseCreateRequest {
	/** Whether to run the model response in the background. */
	background?: boolean;
	/** Context management configuration. */
	context_management?: {
		type: string;
		compact_threshold?: number;
	}[];
	/** The conversation this response belongs to. */
	conversation?: string | { id: string };
	/** Additional output data to include. */
	include?: ResponseIncludable[];
	/** Text, image, or file inputs to the model. */
	input?: string | InputItemBase[] | ResponseItem[];
	/** System (or developer) message inserted into model's context. */
	instructions?: string;
	/** Upper bound for tokens that can be generated. */
	max_output_tokens?: number;
	/** Maximum number of total calls to built-in tools. */
	max_tool_calls?: number;
	/** Set of 16 key-value pairs attached to the object. */
	metadata?: Metadata;
	/** Model ID used to generate the response. */
	model?: ResponsesModel | (string & {});
	/** Whether to allow parallel tool calls. */
	parallel_tool_calls?: boolean;
	/** Previous response ID for multi-turn conversations. */
	previous_response_id?: string;
	/** Reference to a prompt template and its variables. */
	prompt?: {
		id: string;
		version?: string;
		variables?: Record<string, string | ResponseInputContent>;
	};
	/** Key for prompt caching optimization. */
	prompt_cache_key?: string;
	/** Retention policy for prompt cache. */
	prompt_cache_retention?: PromptCacheRetention;
	/** Configuration options for reasoning models. */
	reasoning?: {
		effort?: ReasoningEffort;
		generate_summary?: ReasoningSummary;
		summary?: ReasoningSummary;
	};
	/** Stable identifier for safety / abuse detection. */
	safety_identifier?: string;
	/** Specifies the processing type for serving the request. */
	service_tier?: ServiceTier;
	/** Whether to store the generated response for later retrieval. */
	store?: boolean;
	/** If true, stream the response as SSE. */
	stream?: boolean;
	/** Options for streaming response. */
	stream_options?: {
		include_obfuscation?: boolean;
	};
	/** Sampling temperature, between 0 and 2. */
	temperature?: number;
	/** Text response configuration options. */
	text?: {
		format?: ResponseFormatTextConfig;
		verbosity?: Verbosity;
	};
	/** How the model should select which tool to use. */
	tool_choice?: ResponseToolChoice;
	/** An array of tools the model may call. */
	tools?: ResponseTool[];
	/** Number of most likely tokens to return (0-20). Requires enable_logprobs. */
	top_logprobs?: number;
	/** Nucleus sampling probability mass. */
	top_p?: number;
	/** Truncation strategy. */
	truncation?: TruncationStrategy;
	/** Deprecated. Use prompt_cache_key and safety_identifier instead. */
	user?: string;
}
