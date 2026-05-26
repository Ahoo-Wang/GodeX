import type { ProviderCapabilities } from "../../../adapter/mapper/chat/compatibility-plan";

export const OPENAI_CAPABILITIES: ProviderCapabilities = {
	parameters: {
		supported: new Set([
			"stream",
			"temperature",
			"top_p",
			"max_output_tokens",
			"user",
			"metadata",
			"store",
			"service_tier",
			"prompt_cache_key",
			"prompt_cache_retention",
			"safety_identifier",
			"parallel_tool_calls",
			"reasoning",
			"text.format",
			"text.verbosity",
		]),
	},
	tools: {
		supported: new Set([
			"function",
			"custom",
			"web_search",
			"web_search_2025_08_26",
			"web_search_preview",
			"web_search_preview_2025_03_11",
			"local_shell",
			"shell",
			"apply_patch",
			"tool_search",
			"namespace",
		]),
	},
	toolChoice: {
		supported: new Set([
			"auto",
			"none",
			"required",
			"function",
			"custom",
			"allowed_tools",
		]),
	},
	responseFormats: {
		supported: new Set(["text", "json_object", "json_schema"]),
	},
	reasoning: { effort: "native" },
	streaming: { usage: true },
};
