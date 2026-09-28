// ============================================================
// Shared types used by both Chat Completions and Responses APIs
// ============================================================

// ---- Literal Unions ----

export type Role = "user" | "assistant" | "system" | "developer";

export type ServiceTier = "auto" | "default" | "flex" | "scale" | "priority";

export type ReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type ReasoningSummary = "auto" | "concise" | "detailed";

export type PromptCacheRetention = "in_memory" | "24h";

export type Verbosity = "low" | "medium" | "high";

export type TruncationStrategy = "auto" | "disabled";

export type AudioFormat = "wav" | "aac" | "mp3" | "flac" | "opus" | "pcm16";

export type AudioVoice =
	| "alloy"
	| "ash"
	| "ballad"
	| "coral"
	| "echo"
	| "fable"
	| "nova"
	| "onyx"
	| "sage"
	| "shimmer"
	| "marin"
	| "cedar"
	| "verse";

export type ImageDetail = "low" | "high" | "auto" | "original";

export type ImageGenerationAction = "generate" | "edit" | "auto";

export type ImageBackground = "transparent" | "opaque" | "auto";

export type ImageOutputFormat = "png" | "webp" | "jpeg";

export type ImageQuality = "low" | "medium" | "high" | "auto";

export type ImageModeration = "auto" | "low";

export type ImageInputFidelity = "high" | "low";

export type ImageStandardSize =
	| "1024x1024"
	| "1024x1536"
	| "1536x1024"
	| "auto";

export type ItemStatus = "in_progress" | "completed" | "incomplete";

export type FinishReason =
	| "stop"
	| "length"
	| "tool_calls"
	| "content_filter"
	| "function_call";

export type ToolChoiceMode = "none" | "auto" | "required";

export type SearchContextSize = "low" | "medium" | "high";

export type McpConnectorId =
	| "connector_dropbox"
	| "connector_gmail"
	| "connector_googlecalendar"
	| "connector_googledrive"
	| "connector_microsoftteams"
	| "connector_outlookcalendar"
	| "connector_outlookemail"
	| "connector_sharepoint";

export type McpApprovalSetting = "always" | "never";

export type ContainerMemoryLimit = "1g" | "4g" | "16g" | "64g";

export type Phase = "commentary" | "final_answer";

export type FileSearchRanker = "auto" | "default-2024-11-15";

// ---- Metadata ----

/** Set of 16 key-value pairs attached to an object. */
export type Metadata = Record<string, string>;

// ---- Token & Logprob Types ----

/** Log probability info for a single token. */
export interface ChatCompletionTokenLogprob {
	token: string;
	bytes: number[] | null;
	logprob: number;
	top_logprobs: TokenLogprobItem[];
}

export interface TokenLogprobItem {
	token: string;
	bytes: number[] | null;
	logprob: number;
}

// ---- Usage ----

export interface CompletionTokensDetails {
	accepted_prediction_tokens?: number;
	audio_tokens?: number;
	reasoning_tokens?: number;
	rejected_prediction_tokens?: number;
}

export interface PromptTokensDetails {
	audio_tokens?: number;
	cached_tokens?: number;
}

export interface CompletionUsage {
	completion_tokens: number;
	prompt_tokens: number;
	total_tokens: number;
	completion_tokens_details?: CompletionTokensDetails;
	prompt_tokens_details?: PromptTokensDetails;
}

// ---- Custom Tool Input Format ----

export type TextFormat = { type: "text" };

export interface GrammarFormat {
	type: "grammar";
	definition: string;
	syntax: "lark" | "regex";
}

export type CustomToolInputFormat = TextFormat | GrammarFormat;

// ---- Structured Output / Response Format ----

export interface ResponseFormatText {
	type: "text";
}

export interface ResponseFormatJSONObject {
	type: "json_object";
}

export interface ResponseFormatJSONSchema {
	type: "json_schema";
	json_schema: {
		name: string;
		description?: string;
		schema?: Record<string, unknown>;
		strict?: boolean;
	};
}

export type ResponseFormat =
	| ResponseFormatText
	| ResponseFormatJSONSchema
	| ResponseFormatJSONObject;

// For Responses API (text.format instead of response_format)
export interface ResponseFormatTextJSONSchemaConfig {
	type: "json_schema";
	name: string;
	schema: Record<string, unknown>;
	description?: string;
	strict?: boolean;
}

export type ResponseFormatTextConfig =
	| ResponseFormatText
	| ResponseFormatTextJSONSchemaConfig
	| ResponseFormatJSONObject;

// ---- Container / Network Policy ----

export interface ContainerNetworkPolicyDisabled {
	type: "disabled";
}

export interface ContainerNetworkPolicyDomainSecret {
	domain: string;
	name: string;
	value: string;
}

export interface ContainerNetworkPolicyAllowlist {
	type: "allowlist";
	allowed_domains: string[];
	domain_secrets?: ContainerNetworkPolicyDomainSecret[];
}

export type ContainerNetworkPolicy =
	| ContainerNetworkPolicyDisabled
	| ContainerNetworkPolicyAllowlist;

// ---- File Search Filters ----

export type FilterComparisonType =
	| "eq"
	| "ne"
	| "gt"
	| "gte"
	| "lt"
	| "lte"
	| "in"
	| "nin";

export interface ComparisonFilter {
	type: FilterComparisonType;
	key: string;
	value: string | number | boolean | (string | number)[];
}

export type FilterCombinationType = "and" | "or";

export interface CompoundFilter {
	type: FilterCombinationType;
	filters: (ComparisonFilter | CompoundFilter)[];
}

export type FileSearchFilter = ComparisonFilter | CompoundFilter;

export interface FileSearchRankingOptions {
	hybrid_search?: {
		embedding_weight: number;
		text_weight: number;
	};
	ranker?: FileSearchRanker;
	score_threshold?: number;
}

// ---- Location ----

export interface ApproximateLocation {
	type?: "approximate";
	city?: string;
	country?: string;
	region?: string;
	timezone?: string;
}

// ---- MCP Tool Filter ----

export interface McpToolFilter {
	read_only?: boolean;
	tool_names?: string[];
}

export interface McpToolApprovalFilter {
	always?: McpToolFilter;
	never?: McpToolFilter;
}

export type McpAllowedTools = string[] | McpToolFilter;
export type McpRequireApproval = McpToolApprovalFilter | McpApprovalSetting;

// ---- Skills ----

export interface SkillReference {
	type: "skill_reference";
	skill_id: string;
	version?: string;
}

export interface InlineSkillSource {
	type: "base64";
	media_type: "application/zip";
	data: string;
}

export interface InlineSkill {
	type: "inline";
	name: string;
	description: string;
	source: InlineSkillSource;
}

export interface LocalSkill {
	name: string;
	description: string;
	path: string;
}

// ---- Error ----

export type ResponseErrorCode =
	| "server_error"
	| "rate_limit_exceeded"
	| "invalid_prompt"
	| "vector_store_timeout"
	| "invalid_image"
	| "invalid_image_format"
	| "invalid_base64_image"
	| "invalid_image_url"
	| "image_too_large"
	| "image_too_small"
	| "image_parse_error"
	| "image_content_policy_violation"
	| "invalid_image_mode"
	| "image_file_too_large"
	| "unsupported_image_media_type"
	| "empty_image_file"
	| "failed_to_download_image"
	| "image_file_not_found";

export interface ResponseError {
	code: ResponseErrorCode;
	message: string;
}
