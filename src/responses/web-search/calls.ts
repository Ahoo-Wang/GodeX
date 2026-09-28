import type { ToolPlan } from "../../bridge/tools";
import {
	isWebSearchTool,
	WEB_SEARCH_FUNCTION_NAME,
} from "../../bridge/tools/web-search";
import type {
	FunctionCall,
	ResponseItem,
	WebSearchCall,
	WebSearchPreviewTool,
	WebSearchTool,
} from "../../protocol/openai/responses";
import type { SearchRequest } from "../../search";

export interface ManagedWebSearchCall {
	readonly providerCall: {
		readonly callId: string;
		readonly name: string;
		readonly arguments: string;
	};
	readonly query: string;
	readonly queries: readonly string[];
	readonly search: SearchRequest;
}

export function extractManagedWebSearchCalls(input: {
	readonly output: readonly ResponseItem[];
	readonly tools: ToolPlan;
}): ManagedWebSearchCall[] {
	const declaration = input.tools.declarations.find(
		(declaration) =>
			declaration.execution === "godex_managed" &&
			declaration.providerType === "function" &&
			isWebSearchTool(declaration.tool),
	);
	if (!declaration || !isWebSearchTool(declaration.tool)) return [];
	const searchTool = declaration.tool;

	return input.output.flatMap((item): ManagedWebSearchCall[] => {
		if (!isWebSearchFunctionCall(item)) return [];
		const parsed = parseArguments(item.arguments);
		if (!parsed.query) return [];
		const queries = parsed.queries ?? [parsed.query];
		return [
			{
				providerCall: {
					callId: item.call_id,
					name: item.name,
					arguments: item.arguments,
				},
				query: parsed.query,
				queries,
				search: {
					query: parsed.query,
					queries,
					allowedDomains: allowedDomains(searchTool),
					contextSize: searchTool.search_context_size ?? "medium",
					contentTypes: searchTool.search_content_types ?? ["text"],
					userLocation: searchTool.user_location,
				},
			},
		];
	});
}

export function webSearchCallItem(input: {
	readonly responseId: string;
	readonly index: number;
	readonly query: string;
	readonly queries: readonly string[];
	readonly sources?: readonly { readonly url: string }[];
	readonly status: WebSearchCall["status"];
}): WebSearchCall {
	return {
		id: `ws_${input.responseId}_${input.index}`,
		type: "web_search_call",
		status: input.status,
		action: {
			type: "search",
			query: input.query,
			queries: [...input.queries],
			...(input.sources
				? {
						sources: input.sources.map((source) => ({
							type: "url" as const,
							url: source.url,
						})),
					}
				: {}),
		},
	};
}

function allowedDomains(
	tool: WebSearchTool | WebSearchPreviewTool,
): readonly string[] | undefined {
	return "filters" in tool ? tool.filters?.allowed_domains : undefined;
}

function isWebSearchFunctionCall(item: ResponseItem): item is FunctionCall {
	return (
		item.type === "function_call" && item.name === WEB_SEARCH_FUNCTION_NAME
	);
}

function parseArguments(value: string): {
	readonly query?: string;
	readonly queries?: string[];
} {
	try {
		const parsed = JSON.parse(value);
		if (!isRecord(parsed) || typeof parsed.query !== "string") return {};
		const queries = Array.isArray(parsed.queries)
			? parsed.queries.filter(
					(item): item is string => typeof item === "string",
				)
			: undefined;
		return { query: parsed.query, ...(queries ? { queries } : {}) };
	} catch {
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
