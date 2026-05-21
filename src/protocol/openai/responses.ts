// ============================================================
// OpenAI Responses API — Request & Response Types
// POST /responses
// ============================================================

import type { ImageGenerationModel, ResponsesModel } from "./models";
import type {
	ApproximateLocation,
	ContainerMemoryLimit,
	ContainerNetworkPolicy,
	CustomToolInputFormat,
	FileSearchFilter,
	FileSearchRankingOptions,
	ImageBackground,
	ImageDetail,
	ImageGenerationAction,
	ImageInputFidelity,
	ImageModeration,
	ImageOutputFormat,
	ImageQuality,
	ImageStandardSize,
	InlineSkill,
	ItemStatus,
	LocalSkill,
	McpAllowedTools,
	McpConnectorId,
	McpRequireApproval,
	Metadata,
	Phase,
	PromptCacheRetention,
	ReasoningEffort,
	ReasoningSummary,
	ResponseError,
	ResponseFormatTextConfig,
	Role,
	SearchContextSize,
	ServiceTier,
	SkillReference,
	TokenLogprobItem,
	ToolChoiceMode,
	TruncationStrategy,
	Verbosity,
} from "./shared";

// ============================================================
// Input Content Types
// ============================================================

export interface ResponseInputText {
	type: "input_text";
	text: string;
}

export interface ResponseInputImage {
	type: "input_image";
	detail?: ImageDetail;
	file_id?: string;
	image_url?: string;
}

export interface ResponseInputFile {
	type: "input_file";
	detail?: "low" | "high";
	file_data?: string;
	file_id?: string;
	file_url?: string;
	filename?: string;
}

export type ResponseInputContent =
	| ResponseInputText
	| ResponseInputImage
	| ResponseInputFile;

export type ResponseInputMessageContentList = ResponseInputContent[];

// ============================================================
// Input Items (EasyInputMessage, Message, and full union)
// ============================================================

export interface EasyInputMessage {
	content: string | ResponseInputMessageContentList;
	role: Role;
	phase?: Phase;
	type?: "message";
}

export interface ResponseInputMessage {
	content: ResponseInputMessageContentList;
	role: "user" | "system" | "developer";
	status?: ItemStatus;
	type?: "message";
}

export type InputItemBase = EasyInputMessage | ResponseInputMessage;

/** Convenience: a text string or a list of input items. */
export type InputItem = string | InputItemBase;

// ============================================================
// Output Content Types
// ============================================================

export interface ResponseOutputText {
	type: "output_text";
	text: string;
	annotations?: ResponseAnnotation[];
	logprobs?: ResponseTokenLogprob[];
}

export interface ResponseOutputRefusal {
	type: "refusal";
	refusal: string;
}

export type ResponseOutputContent = ResponseOutputText | ResponseOutputRefusal;

export interface ResponseTokenLogprob {
	token: string;
	bytes: number[] | null;
	logprob: number;
	top_logprobs: TokenLogprobItem[];
}

// ============================================================
// Annotations
// ============================================================

export interface FileCitation {
	type: "file_citation";
	file_id: string;
	filename: string;
	index: number;
}

export interface URLCitation {
	type: "url_citation";
	start_index: number;
	end_index: number;
	title: string;
	url: string;
}

export interface ContainerFileCitation {
	type: "container_file_citation";
	container_id: string;
	end_index: number;
	file_id: string;
	filename: string;
	start_index: number;
}

export interface FilePath {
	type: "file_path";
	file_id: string;
	index: number;
}

export type ResponseAnnotation =
	| FileCitation
	| URLCitation
	| ContainerFileCitation
	| FilePath;

// ============================================================
// Output Message
// ============================================================

export interface ResponseOutputMessage {
	id: string;
	type: "message";
	role: "assistant";
	content: ResponseOutputContent[];
	status: ItemStatus;
	phase?: Phase;
}

// ============================================================
// Tool Call Items (output/input)
// ============================================================

export interface FileSearchCall {
	id: string;
	type: "file_search_call";
	queries: string[];
	status: "in_progress" | "searching" | "completed" | "incomplete" | "failed";
	results?: FileSearchCallResult[];
}

export interface FileSearchCallResult {
	attributes?: Record<string, string | number | boolean>;
	file_id?: string;
	filename?: string;
	score?: number;
	text?: string;
}

// === Computer Call ===

export interface ComputerActionClick {
	type: "click";
	x: number;
	y: number;
	button: "left" | "right" | "wheel" | "back" | "forward";
	keys?: string[];
}

export interface ComputerActionDoubleClick {
	type: "double_click";
	x: number;
	y: number;
	keys: string[];
}

export interface ComputerActionDrag {
	type: "drag";
	path: { x: number; y: number }[];
	keys?: string[];
}

export interface ComputerActionKeypress {
	type: "keypress";
	keys: string[];
}

export interface ComputerActionMove {
	type: "move";
	x: number;
	y: number;
	keys?: string[];
}

export interface ComputerActionScreenshot {
	type: "screenshot";
}

export interface ComputerActionScroll {
	type: "scroll";
	scroll_x: number;
	scroll_y: number;
	x: number;
	y: number;
	keys?: string[];
}

export interface ComputerActionType {
	type: "type";
	text: string;
}

export interface ComputerActionWait {
	type: "wait";
}

export type ComputerAction =
	| ComputerActionClick
	| ComputerActionDoubleClick
	| ComputerActionDrag
	| ComputerActionKeypress
	| ComputerActionMove
	| ComputerActionScreenshot
	| ComputerActionScroll
	| ComputerActionType
	| ComputerActionWait;

export interface ComputerCall {
	id: string;
	type: "computer_call";
	call_id: string;
	pending_safety_checks: ComputerSafetyCheck[];
	status: ItemStatus;
	action?: ComputerAction;
	actions?: ComputerAction[];
}

export interface ComputerSafetyCheck {
	id: string;
	code?: string;
	message?: string;
}

export interface ResponseComputerToolCallOutputScreenshot {
	type: "computer_screenshot";
	file_id?: string;
	image_url?: string;
}

export interface ComputerCallOutput {
	id?: string;
	type: "computer_call_output";
	call_id: string;
	output: ResponseComputerToolCallOutputScreenshot;
	acknowledged_safety_checks?: ComputerSafetyCheck[];
	status?: ItemStatus;
}

// === Web Search Call ===

export interface WebSearchCallActionSearch {
	type: "search";
	query: string;
	queries?: string[];
	sources?: {
		type: "url";
		url: string;
	}[];
}

export interface WebSearchCallActionOpenPage {
	type: "open_page";
	url?: string;
}

export interface WebSearchCallActionFindInPage {
	type: "find_in_page";
	pattern: string;
	url: string;
}

export type WebSearchCallAction =
	| WebSearchCallActionSearch
	| WebSearchCallActionOpenPage
	| WebSearchCallActionFindInPage;

export interface WebSearchCall {
	id: string;
	type: "web_search_call";
	action: WebSearchCallAction;
	status: "in_progress" | "searching" | "completed" | "failed";
}

// === Function Call ===

export interface FunctionCall {
	id?: string;
	type: "function_call";
	call_id: string;
	name: string;
	arguments: string;
	namespace?: string;
	status?: ItemStatus;
}

export interface FunctionCallOutput {
	id?: string;
	type: "function_call_output";
	call_id: string;
	output: string | ResponseInputContent[];
	status?: ItemStatus;
	created_by?: string;
}

// === Tool Search ===

export interface ToolSearchCall {
	id?: string;
	type: "tool_search_call";
	arguments: unknown;
	call_id?: string;
	execution?: "server" | "client";
	status?: ItemStatus;
}

export interface ToolSearchOutput {
	id?: string;
	type: "tool_search_output";
	tools: ToolDefinition[];
	call_id?: string;
	execution?: "server" | "client";
	status?: ItemStatus;
}

// === MCP Items ===

export interface McpListToolsItemTool {
	input_schema: unknown;
	name: string;
	annotations?: unknown;
	description?: string;
}

export interface McpListTools {
	id: string;
	type: "mcp_list_tools";
	server_label: string;
	tools: McpListToolsItemTool[];
	error?: string;
}

export interface McpApprovalRequest {
	id: string;
	type: "mcp_approval_request";
	arguments: string;
	name: string;
	server_label: string;
}

export interface McpApprovalResponse {
	id?: string;
	type: "mcp_approval_response";
	approval_request_id: string;
	approve: boolean;
	reason?: string;
}

export interface McpCall {
	id: string;
	type: "mcp_call";
	arguments: string;
	name: string;
	server_label: string;
	approval_request_id?: string;
	error?: string;
	output?: string;
	status?: ItemStatus | "calling" | "failed";
}

// === Custom Tool Items ===

export interface CustomToolCall {
	id?: string;
	type: "custom_tool_call";
	call_id: string;
	input: string;
	name: string;
	namespace?: string;
}

export interface CustomToolCallOutput {
	id?: string;
	type: "custom_tool_call_output";
	call_id: string;
	output: string | ResponseInputContent[];
	status?: ItemStatus;
	created_by?: string;
}

export type ToolDefinition =
	| FunctionTool
	| FileSearchTool
	| ComputerTool
	| ComputerUsePreviewTool
	| WebSearchTool
	| McpTool
	| CodeInterpreterTool
	| ImageGenerationTool
	| LocalShellTool
	| ShellTool
	| CustomTool
	| NamespaceTool
	| ToolSearchConfig
	| WebSearchPreviewTool
	| ApplyPatchTool;

// === Reasoning ===

export interface SummaryTextContent {
	type: "summary_text";
	text: string;
}

export interface ReasoningTextContent {
	type: "reasoning_text";
	text: string;
}

export interface Reasoning {
	id: string;
	type: "reasoning";
	summary: SummaryTextContent[];
	content?: ReasoningTextContent[];
	encrypted_content?: string;
	status?: ItemStatus;
}

// === Compaction ===

export interface Compaction {
	id?: string;
	type: "compaction";
	encrypted_content: string;
}

// === Image Generation Call ===

export interface ImageGenerationCall {
	id: string;
	type: "image_generation_call";
	result: string;
	status: "in_progress" | "completed" | "generating" | "failed";
}

// === Code Interpreter Call ===

export interface CodeInterpreterCallOutputLogs {
	type: "logs";
	logs: string;
}

export interface CodeInterpreterCallOutputImage {
	type: "image";
	url: string;
}

export type CodeInterpreterCallOutput =
	| CodeInterpreterCallOutputLogs
	| CodeInterpreterCallOutputImage;

export interface CodeInterpreterCall {
	id: string;
	type: "code_interpreter_call";
	code: string;
	container_id: string;
	outputs: CodeInterpreterCallOutput[] | null;
	status:
		| "in_progress"
		| "completed"
		| "incomplete"
		| "interpreting"
		| "failed";
}

// === Local Shell Call ===

export interface LocalShellCall {
	id: string;
	type: "local_shell_call";
	call_id: string;
	action: {
		type: "exec";
		command: string[];
		env: Record<string, string>;
		timeout_ms?: number;
		user?: string;
		working_directory?: string;
	};
	status: ItemStatus;
}

export interface LocalShellCallOutput {
	id: string;
	type: "local_shell_call_output";
	output: string;
	status?: ItemStatus;
}

// === Shell Call ===

export interface ShellCallAction {
	commands: string[];
	max_output_length?: number;
	timeout_ms?: number;
}

export interface ContainerAuto {
	type: "container_auto";
	file_ids?: string[];
	memory_limit?: ContainerMemoryLimit;
	network_policy?: ContainerNetworkPolicy;
	skills?: (SkillReference | InlineSkill)[];
}

export interface LocalEnvironment {
	type: "local";
	skills?: LocalSkill[];
}

export interface ContainerReference {
	type: "container_reference";
	container_id: string;
}

export type ShellCallEnvironment =
	| ContainerAuto
	| LocalEnvironment
	| ContainerReference;

export interface ShellCall {
	id?: string;
	type: "shell_call";
	call_id: string;
	action: ShellCallAction;
	environment?: LocalEnvironment | ContainerReference;
	status?: ItemStatus;
}

export type ShellCallOutputOutcome =
	| { type: "timeout" }
	| { type: "exit"; exit_code: number };

export interface ShellCallOutputChunk {
	outcome: ShellCallOutputOutcome;
	stderr: string;
	stdout: string;
}

export interface ShellCallOutput {
	call_id: string;
	type: "shell_call_output";
	output: ShellCallOutputChunk[];
	id?: string;
	environment?: LocalEnvironment | ContainerReference;
	max_output_length?: number;
	status?: ItemStatus;
	created_by?: string;
}

// === Apply Patch Items ===

export interface ApplyPatchCreateFileOperation {
	type: "create_file";
	path: string;
	diff: string;
}

export interface ApplyPatchDeleteFileOperation {
	type: "delete_file";
	path: string;
}

export interface ApplyPatchUpdateFileOperation {
	type: "update_file";
	path: string;
	diff: string;
}

export type ApplyPatchOperation =
	| ApplyPatchCreateFileOperation
	| ApplyPatchDeleteFileOperation
	| ApplyPatchUpdateFileOperation;

export interface ApplyPatchCall {
	id?: string;
	type: "apply_patch_call";
	call_id: string;
	operation: ApplyPatchOperation;
	status: "in_progress" | "completed";
	created_by?: string;
}

export interface ApplyPatchCallOutput {
	id?: string;
	type: "apply_patch_call_output";
	call_id: string;
	status: "completed" | "failed";
	output?: string;
	created_by?: string;
}

export interface ItemReference {
	id: string;
	type?: "item_reference";
}

// ============================================================
// Full Input/Output Item Union
// ============================================================

/** Any item that can appear as input or output of a Response. */
export type ResponseItem =
	| EasyInputMessage
	| ResponseInputMessage
	| ResponseOutputMessage
	| FileSearchCall
	| ComputerCall
	| ComputerCallOutput
	| WebSearchCall
	| FunctionCall
	| FunctionCallOutput
	| ToolSearchCall
	| ToolSearchOutput
	| McpListTools
	| McpApprovalRequest
	| McpApprovalResponse
	| McpCall
	| CustomToolCall
	| CustomToolCallOutput
	| Reasoning
	| Compaction
	| ImageGenerationCall
	| CodeInterpreterCall
	| LocalShellCall
	| LocalShellCallOutput
	| ShellCall
	| ShellCallOutput
	| ApplyPatchCall
	| ApplyPatchCallOutput
	| ItemReference;

// ============================================================
// Tool Definitions (for tools parameter)
// ============================================================

// --- Function Tool ---
export interface FunctionTool {
	type: "function";
	name: string;
	parameters: Record<string, unknown>;
	strict: boolean;
	defer_loading?: boolean;
	description?: string;
}

// --- File Search Tool ---
export interface FileSearchTool {
	type: "file_search";
	vector_store_ids: string[];
	filters?: FileSearchFilter;
	max_num_results?: number;
	ranking_options?: FileSearchRankingOptions;
}

// --- Computer Tool ---
export interface ComputerTool {
	type: "computer";
}

// --- Computer Use Preview Tool ---
export interface ComputerUsePreviewTool {
	type: "computer_use_preview";
	display_height: number;
	display_width: number;
	environment: "windows" | "mac" | "linux" | "ubuntu" | "browser";
}

// --- Web Search Tool ---
export interface WebSearchTool {
	type: "web_search" | "web_search_2025_08_26";
	filters?: { allowed_domains?: string[] };
	search_context_size?: SearchContextSize;
	user_location?: ApproximateLocation;
}

// --- Web Search Preview Tool ---
export interface WebSearchPreviewTool {
	type: "web_search_preview" | "web_search_preview_2025_03_11";
	search_content_types?: ("text" | "image")[];
	search_context_size?: SearchContextSize;
	user_location?: ApproximateLocation;
}

// --- MCP Tool ---
export interface McpTool {
	type: "mcp";
	server_label: string;
	allowed_tools?: McpAllowedTools;
	authorization?: string;
	connector_id?: McpConnectorId;
	defer_loading?: boolean;
	headers?: Record<string, string>;
	require_approval?: McpRequireApproval;
	server_description?: string;
	server_url?: string;
}

// --- Code Interpreter Tool ---
export interface CodeInterpreterToolAuto {
	type: "auto";
	file_ids?: string[];
	memory_limit?: ContainerMemoryLimit;
	network_policy?: ContainerNetworkPolicy;
}

export interface CodeInterpreterTool {
	type: "code_interpreter";
	container: string | CodeInterpreterToolAuto;
}

// --- Image Generation Tool ---
export interface ImageGenerationInputMask {
	file_id?: string;
	image_url?: string;
}

export interface ImageGenerationTool {
	type: "image_generation";
	action?: ImageGenerationAction;
	background?: ImageBackground;
	input_fidelity?: ImageInputFidelity;
	input_image_mask?: ImageGenerationInputMask;
	model?: ImageGenerationModel | (string & {});
	moderation?: ImageModeration;
	output_compression?: number;
	output_format?: ImageOutputFormat;
	partial_images?: number;
	quality?: ImageQuality;
	size?: string | ImageStandardSize;
}

// --- Local Shell Tool ---
export interface LocalShellTool {
	type: "local_shell";
}

// --- Shell Tool ---
export interface ShellTool {
	type: "shell";
	environment?: ContainerAuto | LocalEnvironment | ContainerReference;
}

// --- Custom Tool ---
export interface CustomTool {
	type: "custom";
	name: string;
	defer_loading?: boolean;
	description?: string;
	format?: CustomToolInputFormat;
}

// --- Namespace Tool ---

export interface NamespaceFunctionTool {
	name: string;
	type: "function";
	defer_loading?: boolean;
	description?: string;
	parameters?: unknown;
	strict?: boolean;
}

export interface NamespaceCustomTool {
	name: string;
	type: "custom";
	defer_loading?: boolean;
	description?: string;
	format?: CustomToolInputFormat;
}

export interface NamespaceTool {
	type: "namespace";
	name: string;
	description: string;
	tools: (NamespaceFunctionTool | NamespaceCustomTool)[];
}

// --- Tool Search Config ---
export interface ToolSearchConfig {
	type: "tool_search";
	description?: string;
	execution?: "server" | "client";
	parameters?: unknown;
}

// --- Apply Patch Tool ---
export interface ApplyPatchTool {
	type: "apply_patch";
}

// --- Full Tools array type ---
export type ResponseTool =
	| FunctionTool
	| FileSearchTool
	| ComputerTool
	| ComputerUsePreviewTool
	| WebSearchTool
	| McpTool
	| CodeInterpreterTool
	| ImageGenerationTool
	| LocalShellTool
	| ShellTool
	| CustomTool
	| NamespaceTool
	| ToolSearchConfig
	| WebSearchPreviewTool
	| ApplyPatchTool;

// ============================================================
// Tool Choice
// ============================================================

export interface ToolChoiceAllowed {
	type: "allowed_tools";
	mode: "auto" | "required";
	tools: Record<string, unknown>[];
}

export interface ToolChoiceTypes {
	type:
		| "file_search"
		| "web_search_preview"
		| "web_search_preview_2025_03_11"
		| "computer"
		| "computer_use_preview"
		| "computer_use"
		| "code_interpreter"
		| "image_generation";
}

export interface ToolChoiceFunction {
	type: "function";
	name: string;
}

export interface ToolChoiceMcp {
	type: "mcp";
	server_label: string;
	name?: string;
}

export interface ToolChoiceCustom {
	type: "custom";
	name: string;
}

export interface ToolChoiceApplyPatch {
	type: "apply_patch";
}

export interface ToolChoiceShell {
	type: "shell";
}

export type ResponseToolChoice =
	| ToolChoiceMode
	| ToolChoiceAllowed
	| ToolChoiceTypes
	| ToolChoiceFunction
	| ToolChoiceMcp
	| ToolChoiceCustom
	| ToolChoiceApplyPatch
	| ToolChoiceShell;

// ============================================================
// ResponseIncludable
// ============================================================

export type ResponseIncludable =
	| "file_search_call.results"
	| "web_search_call.results"
	| "web_search_call.action.sources"
	| "message.input_image.image_url"
	| "computer_call_output.output.image_url"
	| "code_interpreter_call.outputs"
	| "reasoning.encrypted_content"
	| "message.output_text.logprobs";

// ============================================================
// Request Body
// ============================================================

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

// ============================================================
// Response Object
// ============================================================

export interface ResponseIncompleteDetails {
	reason?: "max_output_tokens" | "content_filter";
}

export type ResponseStatus =
	| "completed"
	| "failed"
	| "in_progress"
	| "cancelled"
	| "queued"
	| "incomplete";

export interface ResponseInputTokensDetails {
	cached_tokens?: number;
}

export interface ResponseOutputTokensDetails {
	reasoning_tokens?: number;
}

export interface ResponseUsage {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	input_tokens_details?: ResponseInputTokensDetails;
	output_tokens_details?: ResponseOutputTokensDetails;
}

export type ResponseInstructions = string | ResponseItem[];

export interface ResponseObject {
	id: string;
	object: "response";
	created_at: number;
	/** The status of the response generation. */
	status: ResponseStatus;
	/** The model used to generate the response. */
	model: string;
	/** The output items generated by the model. */
	output: ResponseItem[];
	/** The instructions used for the response. */
	instructions?: ResponseInstructions | null;
	/** Unix timestamp when this response completed. */
	completed_at?: number | null;
	/** The maximum number of output tokens. */
	max_output_tokens?: number | null;
	/** Maximum number of built-in tool calls processed for the response. */
	max_tool_calls?: number | null;
	/** SDK convenience text aggregated from output_text items. */
	output_text?: string;
	/** The temperature used for the response. */
	temperature?: number | null;
	/** The top_p used for the response. */
	top_p?: number | null;
	/** The tool_choice used for the response. */
	tool_choice?: ResponseToolChoice | null;
	/** The tools available to the model. */
	tools?: ResponseTool[];
	/** Whether parallel tool calls were enabled. */
	parallel_tool_calls?: boolean;
	/** The previous response ID for multi-turn. */
	previous_response_id?: string | null;
	/** Whether the response was stored. */
	store?: boolean;
	/** The streaming status. */
	stream?: boolean;
	/** The prompt template used. */
	prompt?: {
		id: string;
		version?: string;
		variables?: Record<string, string | ResponseInputContent>;
	} | null;
	/** The service tier used. */
	service_tier?: ServiceTier | null;
	/** The metadata attached. */
	metadata?: Metadata;
	/** Token usage statistics. */
	usage?: ResponseUsage | null;
	/** An error object. */
	error?: ResponseError | null;
	/** Details about why the response is incomplete. */
	incomplete_details?: ResponseIncompleteDetails | null;
	/** Context management configuration. */
	context_management?:
		| {
				type: string;
				compact_threshold?: number;
		  }[]
		| null;
	/** Conversation this response belongs to. */
	conversation?: { id: string } | null;
	/** The reasoning configuration. */
	reasoning?: {
		effort?: ReasoningEffort;
		generate_summary?: ReasoningSummary;
		summary?: ReasoningSummary;
	} | null;
	/** Summaries of the reasoning process. */
	reasoning_summaries?: SummaryTextContent[] | null;
	/** The text response configuration. */
	text?: {
		format?: ResponseFormatTextConfig;
		verbosity?: Verbosity;
	} | null;
	/** The truncation strategy. */
	truncation?: TruncationStrategy;
	/** The user identifier. */
	user?: string | null;
	/** The prompt cache key. */
	prompt_cache_key?: string | null;
	/** The prompt cache retention. */
	prompt_cache_retention?: PromptCacheRetention | null;
	/** The safety identifier. */
	safety_identifier?: string | null;
	/** Include parameter. */
	include?: ResponseIncludable[];
	/** Background mode. */
	background?: boolean;
}

// ============================================================
// Streaming Event Types
// ============================================================

export type ResponseStreamEventType =
	| "response.created"
	| "response.in_progress"
	| "response.completed"
	| "response.failed"
	| "response.incomplete"
	| "response.cancelled"
	| "response.queued"
	| "response.output_item.added"
	| "response.output_item.done"
	| "response.content_part.added"
	| "response.content_part.done"
	| "response.reasoning_summary_part.added"
	| "response.reasoning_summary_part.done"
	| "response.reasoning_text_part.added"
	| "response.reasoning_text_part.done"
	| "response.output_text.delta"
	| "response.output_text.done"
	| "response.refusal.delta"
	| "response.refusal.done"
	| "response.reasoning_summary_text.delta"
	| "response.reasoning_summary_text.done"
	| "response.reasoning_text.delta"
	| "response.reasoning_text.done"
	| "response.logprobs.added"
	| "response.logprobs.done"
	| "response.web_search_call.in_progress"
	| "response.web_search_call.searching"
	| "response.web_search_call.completed"
	| "response.web_search_call.failed"
	| "response.file_search_call.in_progress"
	| "response.file_search_call.searching"
	| "response.file_search_call.completed"
	| "response.file_search_call.failed"
	| "response.function_call_arguments.delta"
	| "response.function_call_arguments.done"
	| "response.code_interpreter_call.in_progress"
	| "response.code_interpreter_call.interpreting"
	| "response.code_interpreter_call.completed"
	| "response.code_interpreter_call.failed"
	| "response.image_generation_call.result.delta"
	| "response.image_generation_call.image_url.delta"
	| "response.image_generation_call.done"
	| "response.computer_call.in_progress"
	| "response.computer_call.completed";

export interface ResponseStreamEvent {
	type: ResponseStreamEventType;
	sequence_number?: number;
	response?: ResponseObject;
	item?: ResponseItem;
	item_id?: string;
	part?: ResponseOutputContent | ReasoningTextContent | SummaryTextContent;
	content_index?: number;
	output_index?: number;
	delta?: string;
	text?: string;
	refusal?: string;
	logprobs?: ResponseTokenLogprob[];
	error?: ResponseError | null;
}
