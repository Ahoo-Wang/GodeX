import type {
	EasyInputMessage,
	ResponseInputMessage,
	ResponseOutputMessage,
} from "./messages";
import type { Compaction, Reasoning } from "./reasoning";
import type {
	ApplyPatchCall,
	ApplyPatchCallOutput,
	CodeInterpreterCall,
	ComputerCall,
	ComputerCallOutput,
	CustomToolCall,
	CustomToolCallOutput,
	FileSearchCall,
	FunctionCall,
	FunctionCallOutput,
	ImageGenerationCall,
	ItemReference,
	LocalShellCall,
	LocalShellCallOutput,
	McpApprovalRequest,
	McpApprovalResponse,
	McpCall,
	McpListTools,
	ShellCall,
	ShellCallOutput,
	ToolSearchCall,
	ToolSearchOutput,
	WebSearchCall,
} from "./tool-items";

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
