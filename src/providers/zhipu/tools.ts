// src/providers/zhipu/tools.ts

import { isRecord } from "../../adapter/utils";
import { ADAPTER_REQUEST_UNSUPPORTED_TOOL, AdapterError } from "../../error";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "../../protocol/openai/responses";
import { getBuiltinFunctionToolDefinition } from "../../tools";
import { toZhipuFunctionName } from "./function-names";
import type {
	ChatTool,
	FunctionParameters,
	ToolChoice,
} from "./protocol/completions";

type UnsupportedToolMode = "throw" | "skip";

interface MapToolsOptions {
	unsupported?: UnsupportedToolMode;
	onUnsupported?: (type: string) => void;
	supportedToolTypes?: ReadonlySet<string>;
}

export function mapTools(
	tools: ResponseTool[] | undefined,
	options: MapToolsOptions = {},
): ChatTool[] {
	if (!tools) return [];

	const result: ChatTool[] = [];
	for (const tool of tools) {
		const mapped = mapTool(tool, options);
		if (mapped === null) continue;
		if (Array.isArray(mapped)) {
			result.push(...mapped);
		} else {
			result.push(mapped);
		}
	}
	assertNoFunctionNameCollisions(result);
	return result;
}

function mapTool(
	tool: ResponseTool,
	options: MapToolsOptions,
): ChatTool | ChatTool[] | null {
	if (!isToolTypeSupported(tool.type, options)) {
		return handleUnsupportedTool(
			tool.type,
			"This Responses tool type is not declared as supported by the provider.",
			options,
		);
	}
	switch (tool.type) {
		case "function": {
			return {
				type: "function",
				function: {
					name: tool.name,
					parameters: { type: "object" as const, ...tool.parameters },
					description: tool.description ?? "",
				},
			};
		}
		case "web_search":
		case "web_search_2025_08_26":
		case "web_search_preview":
		case "web_search_preview_2025_03_11": {
			const ws: {
				enable: boolean;
				search_engine: string;
				content_size?: string;
			} = {
				enable: true,
				search_engine: "search_pro",
			};
			if (tool.search_context_size) {
				ws.content_size =
					tool.search_context_size === "low" ? "medium" : "high";
			}
			return { type: "web_search", web_search: ws } as ChatTool;
		}
		case "file_search": {
			const vsId = tool.vector_store_ids[0];
			if (!vsId) {
				throw unsupportedTool(
					"file_search",
					"file_search requires at least one vector_store_id for Zhipu retrieval.",
				);
			}
			return {
				type: "retrieval",
				retrieval: { knowledge_id: vsId },
			};
		}
		case "mcp": {
			const allowedTools = normalizeMcpAllowedTools(tool.allowed_tools);
			return {
				type: "mcp",
				mcp: {
					server_label: tool.server_label,
					...(tool.server_url ? { server_url: tool.server_url } : {}),
					...(allowedTools ? { allowed_tools: allowedTools } : {}),
					transport_type: "streamable-http",
				},
			};
		}
		case "local_shell":
		case "shell":
		case "apply_patch":
			return builtinFunctionTool(tool.type);
		case "custom":
			return codexFunctionTool(
				tool.name,
				tool.description ??
					"Call this custom tool with a string input when it best matches the user request.",
				{
					input: {
						type: "string",
						description:
							"Input for the custom tool. Keep it concise and valid for the tool name.",
					},
				},
				["input"],
			);
		case "tool_search":
			return codexFunctionTool(
				"tool_search",
				tool.description ??
					"Search available tools by query before choosing which tool to call.",
				isRecord(tool.parameters)
					? tool.parameters
					: {
							type: "object" as const,
							properties: {
								query: {
									type: "string",
									description: "Search query for matching tools.",
								},
							},
							required: ["query"],
						},
			);
		case "namespace":
			return tool.tools.map((nestedTool) =>
				codexFunctionTool(
					`${tool.name}__${nestedTool.name}`,
					nestedTool.description ?? `${tool.description} (${nestedTool.name})`,
					nestedTool.type === "function" &&
						nestedTool.parameters &&
						isRecord(nestedTool.parameters)
						? nestedTool.parameters
						: { input: { type: "string" } },
					nestedTool.type === "function" &&
						nestedTool.parameters &&
						isRecord(nestedTool.parameters) &&
						isStringArray(nestedTool.parameters.required)
						? nestedTool.parameters.required
						: undefined,
				),
			);
		default:
			return handleUnsupportedTool(
				tool.type,
				"This Responses tool type is not supported by the Zhipu adapter.",
				options,
			);
	}
}

function isToolTypeSupported(
	type: ResponseTool["type"],
	options: MapToolsOptions,
): boolean {
	return options.supportedToolTypes?.has(type) ?? true;
}

function handleUnsupportedTool(
	type: string,
	message: string,
	options: MapToolsOptions,
): null {
	if (options.unsupported === "skip") {
		options.onUnsupported?.(type);
		return null;
	}
	throw unsupportedTool(type, message);
}

export function mapToolChoice(
	choice: ResponseToolChoice | undefined,
): ToolChoice | undefined {
	if (choice === undefined) return undefined;
	if (choice === "auto") return "auto";
	if (choice === "none") return undefined;
	return "auto";
}

function codexFunctionTool(
	name: string,
	description: string,
	propertiesOrSchema: Record<string, unknown>,
	required?: string[],
): ChatTool {
	const parameters: FunctionParameters =
		propertiesOrSchema.type === "object"
			? (propertiesOrSchema as FunctionParameters)
			: {
					type: "object" as const,
					properties: propertiesOrSchema as Record<
						string,
						Record<string, unknown>
					>,
					...(required ? { required } : {}),
				};
	return {
		type: "function",
		function: {
			name: toZhipuFunctionName(name),
			description,
			parameters,
		},
	};
}

function builtinFunctionTool(
	type: "local_shell" | "shell" | "apply_patch",
): ChatTool {
	const definition = getBuiltinFunctionToolDefinition(type);
	if (!definition) {
		throw unsupportedTool(type, "Missing built-in tool definition.");
	}
	return codexFunctionTool(
		definition.name,
		definition.description,
		definition.parameters,
	);
}

function normalizeMcpAllowedTools(
	allowedTools: Extract<ResponseTool, { type: "mcp" }>["allowed_tools"],
): string[] | undefined {
	if (!allowedTools) return undefined;
	if (Array.isArray(allowedTools)) return allowedTools;
	if ("tool_names" in allowedTools && Array.isArray(allowedTools.tool_names)) {
		return allowedTools.tool_names;
	}
	return undefined;
}

function isStringArray(value: unknown): value is string[] {
	return (
		Array.isArray(value) && value.every((item) => typeof item === "string")
	);
}

function unsupportedTool(type: string, message: string): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_TOOL,
		`Unsupported Responses tool for Zhipu: ${type}. ${message}`,
		{ provider: "zhipu", model: "unknown" },
	);
}

function assertNoFunctionNameCollisions(tools: ChatTool[]): void {
	const seen = new Map<string, number>();
	for (const tool of tools) {
		if (tool.type !== "function") continue;

		const count = seen.get(tool.function.name) ?? 0;
		if (count > 0) {
			throw unsupportedTool(
				"function_name_collision",
				`Multiple tools map to the same Zhipu function name: ${tool.function.name}.`,
			);
		}
		seen.set(tool.function.name, count + 1);
	}
}
