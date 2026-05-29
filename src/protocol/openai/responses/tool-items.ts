import type { ItemStatus } from "../shared";
import type { ResponseInputContent } from "./content";
import type { ContainerReference, LocalEnvironment } from "./environments";
import type { ToolDefinition } from "./tools";

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
	call_id: string;
	output: string;
	status?: ItemStatus;
}

// === Shell Call ===

export interface ShellCallAction {
	commands: string[];
	max_output_length?: number;
	timeout_ms?: number;
}

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
