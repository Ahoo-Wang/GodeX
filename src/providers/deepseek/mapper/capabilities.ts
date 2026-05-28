import type { ProviderCapabilities } from "../../../adapter/mapper/chat/compatibility-plan";

export const DEEPSEEK_MAX_TOOLS = 128;

export const DEEPSEEK_CAPABILITIES: ProviderCapabilities = {
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
		supported: new Set([
			"function",
			"local_shell",
			"shell",
			"apply_patch",
			"custom",
			"tool_search",
			"namespace",
		]),
		degraded: new Map([
			["local_shell", "function"],
			["shell", "function"],
			["apply_patch", "function"],
			["custom", "function"],
			["tool_search", "function"],
			["namespace", "function"],
		]),
		maxTools: DEEPSEEK_MAX_TOOLS,
	},
	toolChoice: { supported: new Set(["auto", "none", "required", "function"]) },
	responseFormats: {
		supported: new Set(["text", "json_object"]),
		degraded: new Map([["json_schema", "json_object"]]),
	},
	reasoning: { effort: "native" },
	streaming: { usage: true },
};
