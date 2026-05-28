// src/providers/zhipu/mapper/tools.ts

import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatToolChoiceMapper,
	ChatToolIndexBuilder,
} from "../../../adapter/mapper/chat/contract";
import {
	flattenToolName,
	ProviderToolIndex,
	ToolIdentityCatalogBuilder,
} from "../../../adapter/mapper/chat/tool-index";
import { isRecord, isStringArray } from "../../../adapter/utils";
import type { ResponsesContext } from "../../../context/responses-context";
import {
	ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
	ADAPTER_REQUEST_UNSUPPORTED_TOOL,
	AdapterError,
} from "../../../error";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "../../../protocol/openai/responses";
import { getBuiltinFunctionToolDefinition } from "../../../tools";
import {
	degradedCustomToolDescription,
	degradedCustomToolParameters,
} from "../../shared/custom-tool-degradation";
import { toZhipuFunctionName } from "../function-names";
import type {
	ChatTool,
	FunctionParameters,
	ToolChoice,
} from "../protocol/completions";
import { ZHIPU_PROVIDER_NAME } from "../provider";

type UnsupportedToolMode = "throw" | "skip";

interface MapToolsOptions {
	unsupported?: UnsupportedToolMode;
	onUnsupported?: (type: string) => void;
	onDegraded?: (type: string, effectiveType: string) => void;
	supportedToolTypes?: ReadonlySet<string>;
	degradedToolTypes?: ReadonlyMap<string, string>;
	identityCatalog?: ToolIdentityCatalogBuilder;
}

export type ZhipuToolIndex = ProviderToolIndex<ChatTool[]>;

export function mapZhipuTools(
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
	const degradedTarget = options.degradedToolTypes?.get(tool.type);
	if (degradedTarget) options.onDegraded?.(tool.type, degradedTarget);
	switch (tool.type) {
		case "function": {
			options.identityCatalog?.addFunction(tool.name);
			return {
				type: "function",
				function: {
					name: toZhipuFunctionName(tool.name),
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
			options.identityCatalog?.addBuiltin(tool.type);
			return builtinFunctionTool(tool.type);
		case "custom":
			options.identityCatalog?.addCustom(tool.name);
			return codexFunctionTool(
				tool.name,
				degradedCustomToolDescription(tool),
				degradedCustomToolParameters(tool),
			);
		case "tool_search":
			options.identityCatalog?.addToolSearch(tool.execution);
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
			return tool.tools.map((nestedTool) => {
				const fallbackDescription = `${tool.description} (${nestedTool.name})`;
				const name = flattenToolName({
					namespace: tool.name,
					name: nestedTool.name,
				});
				options.identityCatalog?.addNamespaceTool(
					tool.name,
					nestedTool.name,
					nestedTool.type,
				);
				if (nestedTool.type === "function") {
					return codexFunctionTool(
						name,
						nestedTool.description ?? fallbackDescription,
						nestedTool.parameters && isRecord(nestedTool.parameters)
							? nestedTool.parameters
							: { input: { type: "string" } },
						nestedTool.parameters &&
							isRecord(nestedTool.parameters) &&
							isStringArray(nestedTool.parameters.required)
							? nestedTool.parameters.required
							: undefined,
					);
				}
				return codexFunctionTool(
					name,
					degradedCustomToolDescription(nestedTool, fallbackDescription),
					degradedCustomToolParameters(nestedTool),
				);
			});
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

export function mapZhipuToolChoice(
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

function unsupportedTool(type: string, message: string): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_TOOL,
		`Unsupported Responses tool for Zhipu: ${type}. ${message}`,
		{ provider: ZHIPU_PROVIDER_NAME, model: "unknown" },
	);
}

export function assertMappedToolCapacity(
	toolCount: number,
	ctx: ResponsesContext,
	plan: CompatibilityPlan,
): void {
	const maxTools = plan.capabilities.tools.maxTools;
	if (maxTools !== undefined && toolCount > maxTools) {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_PARAMETER,
			`Zhipu accepts at most ${maxTools} mapped tools; received ${toolCount}.`,
			{
				provider: ctx.resolved.provider,
				model: ctx.resolved.model,
				parameter: "tools",
				maxTools,
				toolCount,
			},
		);
	}
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

export class ZhipuToolIndexBuilder implements ChatToolIndexBuilder<ChatTool[]> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): ZhipuToolIndex {
		const toolsDisabled = ctx.request.tool_choice === "none";
		const identityCatalog = new ToolIdentityCatalogBuilder(toZhipuFunctionName);
		const tools = toolsDisabled
			? []
			: mapZhipuTools(ctx.request.tools, {
					supportedToolTypes: plan.capabilities.tools.supported,
					degradedToolTypes: plan.capabilities.tools.degraded,
					identityCatalog,
					unsupported: "skip",
					onUnsupported: (type) => {
						ctx.addDiagnostic({
							code: "adapter.tool.unsupported",
							severity: "warn",
							path: `tools[type=${type}]`,
							action: "ignored",
							message: `Tool type '${type}' is not supported, skipping.`,
							metadata: { toolType: type },
						});
					},
					onDegraded: (type, effectiveType) => {
						const message = `Zhipu maps Responses tool '${type}' to ${effectiveType}; provider-native tool semantics may not be enforced.`;
						ctx.addDiagnostic({
							code: "adapter.tool.degraded",
							severity: "warn",
							path: `tools[type=${type}]`,
							action: "degraded",
							message,
							metadata: { toolType: type, effectiveToolType: effectiveType },
						});
						plan.tools.set(type, {
							action: "degraded",
							reason: message,
							effectiveValue: { type: effectiveType },
						});
					},
				});
		assertMappedToolCapacity(tools.length, ctx, plan);
		return new ProviderToolIndex({
			declarations: tools,
			identityCatalog: identityCatalog.build(),
		});
	}
}

export class ZhipuToolChoiceMapper
	implements ChatToolChoiceMapper<ChatTool[], ToolChoice>
{
	map(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
		toolIndex: ZhipuToolIndex,
	): ToolChoice | undefined {
		const requestedToolChoice = ctx.request.tool_choice;
		if (
			requestedToolChoice !== undefined &&
			requestedToolChoice !== "auto" &&
			requestedToolChoice !== "none"
		) {
			ctx.addDiagnostic({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "degraded",
				message:
					"Zhipu Chat Completions only supports auto tool choice; downgraded to auto.",
				metadata: { parameter: "tool_choice", value: requestedToolChoice },
			});
		}
		if (!toolIndex.hasDeclarations()) return undefined;
		return mapZhipuToolChoice(requestedToolChoice);
	}
}
