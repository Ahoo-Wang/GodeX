import type {
	ResponseTool,
	WebSearchPreviewTool,
	WebSearchTool,
} from "../../protocol/openai/responses";

export const WEB_SEARCH_FUNCTION_NAME = "web_search";

export function isWebSearchTool(
	tool: ResponseTool,
): tool is WebSearchTool | WebSearchPreviewTool {
	return (
		tool.type === "web_search" ||
		tool.type === "web_search_2025_08_26" ||
		tool.type === "web_search_preview" ||
		tool.type === "web_search_preview_2025_03_11"
	);
}

export function isWebSearchToolType(type: string): boolean {
	return (
		type === "web_search" ||
		type === "web_search_2025_08_26" ||
		type === "web_search_preview" ||
		type === "web_search_preview_2025_03_11"
	);
}

export function webSearchFunctionDescription(): string {
	return "Search the web for current information and return source URLs and snippets.";
}

export function webSearchFunctionParameters(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "The web search query.",
			},
			queries: {
				type: "array",
				items: { type: "string" },
				description: "Optional additional search queries.",
			},
		},
		required: ["query"],
		additionalProperties: false,
	};
}
