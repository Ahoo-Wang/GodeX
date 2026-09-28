import type { ImageGenerationModel } from "../models";
import type {
	ApproximateLocation,
	ContainerMemoryLimit,
	ContainerNetworkPolicy,
	CustomToolInputFormat,
	FileSearchFilter,
	FileSearchRankingOptions,
	ImageBackground,
	ImageGenerationAction,
	ImageInputFidelity,
	ImageModeration,
	ImageOutputFormat,
	ImageQuality,
	ImageStandardSize,
	McpAllowedTools,
	McpConnectorId,
	McpRequireApproval,
	SearchContextSize,
	ToolChoiceMode,
} from "../shared";
import type {
	ContainerAuto,
	ContainerReference,
	LocalEnvironment,
} from "./environments";

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
	external_web_access?: boolean;
	filters?: { allowed_domains?: string[] };
	search_content_types?: ("text" | "image")[];
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
