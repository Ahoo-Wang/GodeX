import type { ProviderCapabilities } from "../../../adapter/mapper/chat/compatibility-plan";

export const ZHIPU_SUPPORTED_TOOL_TYPES: ReadonlySet<string> = new Set([
	"function",
	"web_search",
	"web_search_2025_08_26",
	"web_search_preview",
	"web_search_preview_2025_03_11",
	"file_search",
	"mcp",
	"local_shell",
	"shell",
	"apply_patch",
	"custom",
	"tool_search",
	"namespace",
]);

export const ZHIPU_MAX_TOOLS = 128;

export const ZHIPU_CAPABILITIES: ProviderCapabilities = {
	parameters: {
		supported: new Set([
			"stream",
			"temperature",
			"top_p",
			"max_output_tokens",
			"safety_identifier",
			"user",
			"reasoning",
			"text.format",
		]),
	},
	tools: {
		supported: ZHIPU_SUPPORTED_TOOL_TYPES,
		degraded: new Map([
			["web_search_preview", "web_search"],
			["web_search_preview_2025_03_11", "web_search"],
			["file_search", "retrieval"],
			["local_shell", "function"],
			["shell", "function"],
			["apply_patch", "function"],
			["custom", "function"],
			["tool_search", "function"],
			["namespace", "function"],
		]),
		maxTools: ZHIPU_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto", "none"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
		degraded: new Map([["json_schema", "json_object"]]),
	},
	reasoning: { effort: "boolean" },
	streaming: { usage: true },
};
