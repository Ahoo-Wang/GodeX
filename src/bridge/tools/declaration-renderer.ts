import type {
	FileSearchTool,
	McpTool,
	ResponseTool,
} from "../../protocol/openai/responses";
import { getBuiltinFunctionToolDefinition } from "../../tools";
import {
	degradedCustomToolDescription,
	degradedCustomToolParameters,
} from "./custom-tool-degradation";
import type { ToolDeclarationPlan } from "./tool-plan";
import {
	isWebSearchTool,
	webSearchFunctionDescription,
	webSearchFunctionParameters,
} from "./web-search";

export interface ChatFunctionToolDeclaration {
	readonly type: "function";
	readonly function: {
		readonly name: string;
		readonly description?: string;
		readonly parameters: Record<string, unknown>;
		readonly strict?: boolean;
	};
}

export type ProviderToolDeclaration =
	| ChatFunctionToolDeclaration
	| { readonly [key: string]: unknown };

export function renderProviderToolDeclarations(
	plans: readonly ToolDeclarationPlan[],
): ProviderToolDeclaration[] {
	return plans
		.map((plan) => providerToolDeclaration(plan))
		.filter((declaration) => declaration !== undefined);
}

export function renderFunctionDeclarations(
	plans: readonly ToolDeclarationPlan[],
): ChatFunctionToolDeclaration[] {
	return plans
		.filter((plan) => plan.providerType === "function")
		.map((plan) => functionDeclaration(plan));
}

function providerToolDeclaration(
	plan: ToolDeclarationPlan,
): ProviderToolDeclaration | undefined {
	switch (plan.providerType) {
		case "function":
			return functionDeclaration(plan);
		case "web_search":
			return webSearchDeclaration(plan.tool);
		case "retrieval":
			return retrievalDeclaration(plan.tool);
		case "mcp":
			return mcpDeclaration(plan.tool);
		default:
			return undefined;
	}
}

function functionDeclaration(
	plan: ToolDeclarationPlan,
): ChatFunctionToolDeclaration {
	const { tool, providerName } = plan;
	if (tool.type === "function") {
		return {
			type: "function",
			function: {
				name: providerName,
				...(tool.description ? { description: tool.description } : {}),
				parameters: tool.parameters,
				strict: tool.strict,
			},
		};
	}
	if (tool.type === "custom") {
		return {
			type: "function",
			function: {
				name: providerName,
				description: degradedCustomToolDescription(tool),
				parameters: degradedCustomToolParameters(tool),
			},
		};
	}
	if (isWebSearchTool(tool) && plan.providerType === "function") {
		return {
			type: "function",
			function: {
				name: providerName,
				description: webSearchFunctionDescription(),
				parameters: webSearchFunctionParameters(),
			},
		};
	}
	const builtinDefinition = getBuiltinFunctionToolDefinition(tool.type);
	if (builtinDefinition) {
		return {
			type: "function",
			function: {
				name: providerName,
				description: builtinDefinition.description,
				parameters: builtinDefinition.parameters,
			},
		};
	}
	return {
		type: "function",
		function: {
			name: providerName,
			parameters: genericObjectSchema(),
		},
	};
}

function webSearchDeclaration(
	tool: ResponseTool,
): ProviderToolDeclaration | undefined {
	if (!isWebSearchTool(tool)) return undefined;
	const allowedDomain =
		"filters" in tool ? tool.filters?.allowed_domains?.[0] : undefined;
	return {
		type: "web_search",
		web_search: {
			enable: true,
			search_engine: "search_std",
			content_size: tool.search_context_size === "high" ? "high" : "medium",
			...(allowedDomain ? { search_domain_filter: allowedDomain } : {}),
			...(tool.user_location ? { user_location: tool.user_location } : {}),
		},
	};
}

function retrievalDeclaration(
	tool: ResponseTool,
): ProviderToolDeclaration | undefined {
	if (!isFileSearchTool(tool)) return undefined;
	const [knowledgeId] = tool.vector_store_ids;
	if (!knowledgeId) return undefined;
	return {
		type: "retrieval",
		retrieval: {
			knowledge_id: knowledgeId,
		},
	};
}

function mcpDeclaration(
	tool: ResponseTool,
): ProviderToolDeclaration | undefined {
	if (!isMcpTool(tool)) return undefined;
	return {
		type: "mcp",
		mcp: {
			server_label: tool.server_label,
			...(tool.server_url ? { server_url: tool.server_url } : {}),
			...(tool.allowed_tools ? { allowed_tools: tool.allowed_tools } : {}),
			...(tool.headers ? { headers: tool.headers } : {}),
		},
	};
}

function genericObjectSchema(): Record<string, unknown> {
	return {
		type: "object",
		additionalProperties: true,
	};
}

function isFileSearchTool(tool: ResponseTool): tool is FileSearchTool {
	return tool.type === "file_search";
}

function isMcpTool(tool: ResponseTool): tool is McpTool {
	return tool.type === "mcp";
}
