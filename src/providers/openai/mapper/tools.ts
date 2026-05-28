import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatToolChoiceMapper,
	ChatToolIndexBuilder,
} from "../../../adapter/mapper/chat/contract";
import {
	flattenToolName,
	ProviderToolIndex,
	type ProviderToolIndexSidecars,
	ToolIdentityCatalogBuilder,
} from "../../../adapter/mapper/chat/tool-index";
import { isRecord } from "../../../adapter/utils";
import type { ResponsesContext } from "../../../context/responses-context";
import { ADAPTER_REQUEST_UNSUPPORTED_TOOL, AdapterError } from "../../../error";
import type {
	ChatCompletionCustomTool,
	ChatCompletionFunctionTool,
	ChatCompletionNamedToolChoice,
	ChatCompletionNamedToolChoiceCustom,
	ChatCompletionTool,
	ChatCompletionToolChoiceOption,
	ChatCompletionWebSearchOptions,
} from "../../../protocol/openai/completions";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "../../../protocol/openai/responses";
import type { SearchContextSize } from "../../../protocol/openai/shared";
import { getBuiltinFunctionToolDefinition } from "../../../tools";
import {
	degradedCustomToolDescription,
	degradedCustomToolParameters,
} from "../../shared/custom-tool-degradation";
import { OPENAI_PROVIDER_NAME } from "../provider";

export interface OpenAIMappedTools {
	tools: ChatCompletionTool[];
	webSearchOptions: ChatCompletionWebSearchOptions | undefined;
}

export type OpenAIToolSidecars = ProviderToolIndexSidecars & {
	webSearchOptions?: ChatCompletionWebSearchOptions;
};

export type OpenAIToolIndex = ProviderToolIndex<
	ChatCompletionTool[],
	OpenAIToolSidecars
>;

interface MapOpenAIToolsOptions {
	supportedToolTypes?: ReadonlySet<string>;
	degradedToolTypes?: ReadonlyMap<string, string>;
	identityCatalog?: ToolIdentityCatalogBuilder;
	onUnsupported?: (type: string) => void;
	onDegraded?: (type: string, effectiveType?: string) => void;
}

export function createOpenAIToolIndex(
	ctx: ResponsesContext,
	plan: CompatibilityPlan,
): OpenAIToolIndex {
	if (ctx.request.tool_choice === "none") {
		return new ProviderToolIndex<ChatCompletionTool[], OpenAIToolSidecars>({
			declarations: [],
			sidecars: {},
		});
	}

	const identityCatalog = new ToolIdentityCatalogBuilder();
	const mapped = mapOpenAITools(ctx.request.tools, {
		supportedToolTypes: plan.capabilities.tools.supported,
		degradedToolTypes: plan.capabilities.tools.degraded,
		identityCatalog,
		onUnsupported: (type) => {
			ctx.addDiagnostic({
				code: "adapter.tool.unsupported",
				severity: "warn",
				path: `tools[type=${type}]`,
				action: "ignored",
				message: `Tool type '${type}' is not supported by OpenAI Chat Completions mapping; skipped.`,
				metadata: { toolType: type },
			});
		},
		onDegraded: (type, effectiveType) => {
			const effective = effectiveType ?? "web_search_options";
			const message = `Responses tool '${type}' was mapped to OpenAI Chat Completions ${effective}.`;
			ctx.addDiagnostic({
				code: "adapter.tool.degraded",
				severity: "warn",
				path: `tools[type=${type}]`,
				action: "degraded",
				message,
				metadata: { toolType: type },
			});
			plan.tools.set(type, {
				action: "degraded",
				reason: message,
				effectiveValue: { type: effective },
			});
		},
	});
	return new ProviderToolIndex<ChatCompletionTool[], OpenAIToolSidecars>({
		declarations: mapped.tools,
		sidecars: mapped.webSearchOptions
			? { webSearchOptions: mapped.webSearchOptions }
			: {},
		identityCatalog: identityCatalog.build(),
	});
}

export function mapOpenAITools(
	tools: ResponseTool[] | undefined,
	options: MapOpenAIToolsOptions = {},
): OpenAIMappedTools {
	if (!tools || tools.length === 0) {
		return { tools: [], webSearchOptions: undefined };
	}

	const mappedTools: ChatCompletionTool[] = [];
	let webSearchOptions: ChatCompletionWebSearchOptions | undefined;

	for (const tool of tools) {
		const type = tool.type;
		if (!(options.supportedToolTypes?.has(type) ?? true)) {
			options.onUnsupported?.(type);
			continue;
		}
		const degradedTarget = options.degradedToolTypes?.get(type);
		const reportedDegradation = degradedTarget !== undefined;
		if (degradedTarget) options.onDegraded?.(type, degradedTarget);
		switch (type) {
			case "function": {
				options.identityCatalog?.addFunction(tool.name);
				mappedTools.push({
					type: "function",
					function: {
						name: tool.name,
						parameters: tool.parameters,
						strict: tool.strict,
						...(tool.description ? { description: tool.description } : {}),
					},
				});
				break;
			}
			case "custom": {
				options.identityCatalog?.addCustom(tool.name);
				mappedTools.push({
					type: "custom",
					custom: {
						name: tool.name,
						...(tool.description ? { description: tool.description } : {}),
						...(tool.format
							? {
									format:
										tool.format.type === "text"
											? { type: "text" as const }
											: {
													type: "grammar" as const,
													grammar: {
														definition: tool.format.definition,
														syntax: tool.format.syntax,
													},
												},
								}
							: {}),
					},
				} satisfies ChatCompletionCustomTool);
				break;
			}
			case "web_search":
			case "web_search_2025_08_26": {
				webSearchOptions = mapWebSearchOptionsFromTool(tool);
				if (!reportedDegradation) options.onDegraded?.(type);
				break;
			}
			case "web_search_preview":
			case "web_search_preview_2025_03_11": {
				webSearchOptions = mapWebSearchOptionsFromTool(tool);
				if (!reportedDegradation) options.onDegraded?.(type);
				break;
			}
			case "local_shell":
			case "shell":
			case "apply_patch": {
				const def = getBuiltinFunctionToolDefinition(tool.type);
				if (def) {
					options.identityCatalog?.addBuiltin(tool.type);
					mappedTools.push({
						type: "function",
						function: {
							name: def.name,
							description: def.description,
							parameters: def.parameters,
						},
					});
				}
				break;
			}
			case "tool_search": {
				options.identityCatalog?.addToolSearch(tool.execution);
				mappedTools.push(
					toolSearchToFunctionTool(tool.description, tool.parameters),
				);
				break;
			}
			case "namespace": {
				for (const nestedTool of tool.tools) {
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
						mappedTools.push({
							type: "function",
							function: {
								name,
								description:
									nestedTool.description ??
									`${tool.description} (${nestedTool.name})`,
								parameters: (isRecord(nestedTool.parameters) &&
								nestedTool.parameters.type === "object"
									? nestedTool.parameters
									: {
											type: "object",
											properties: { input: { type: "string" } },
										}) as Record<string, unknown>,
							},
						});
					} else if (nestedTool.type === "custom") {
						const fallbackDescription =
							nestedTool.description ??
							`${tool.description} (${nestedTool.name})`;
						mappedTools.push({
							type: "function",
							function: {
								name,
								description: degradedCustomToolDescription(
									nestedTool,
									fallbackDescription,
								),
								parameters: degradedCustomToolParameters(nestedTool),
							},
						});
					}
				}
				break;
			}
			default:
				options.onUnsupported?.(type);
				break;
		}
	}

	assertNoFunctionNameCollisions(mappedTools);
	return { tools: mappedTools, webSearchOptions };
}

function toolSearchToFunctionTool(
	description?: string,
	parameters?: unknown,
): ChatCompletionFunctionTool {
	const params =
		isRecord(parameters) && parameters.type === "object"
			? parameters
			: {
					type: "object",
					properties: {
						query: {
							type: "string",
							description: "Search query for matching tools.",
						},
					},
					required: ["query"],
				};
	return {
		type: "function",
		function: {
			name: "tool_search",
			description:
				description ??
				"Search available tools by query before choosing which tool to call.",
			parameters: params as Record<string, unknown>,
		},
	};
}

function mapWebSearchOptionsFromTool(tool: {
	search_context_size?: SearchContextSize;
	user_location?: {
		city?: string;
		country?: string;
		region?: string;
		timezone?: string;
	};
}): ChatCompletionWebSearchOptions {
	const opts: ChatCompletionWebSearchOptions = {};
	if (tool.search_context_size)
		opts.search_context_size = tool.search_context_size;
	if (tool.user_location) {
		opts.user_location = {
			type: "approximate",
			approximate: {
				...(tool.user_location.city ? { city: tool.user_location.city } : {}),
				...(tool.user_location.country
					? { country: tool.user_location.country }
					: {}),
				...(tool.user_location.region
					? { region: tool.user_location.region }
					: {}),
				...(tool.user_location.timezone
					? { timezone: tool.user_location.timezone }
					: {}),
			},
		};
	}
	return opts;
}

export function mapOpenAIToolChoice(
	choice: ResponseToolChoice | undefined,
	options: {
		onUnsupportedAllowedTool?: (tool: unknown) => void;
	} = {},
): ChatCompletionToolChoiceOption | undefined {
	if (choice === undefined) return undefined;
	if (typeof choice === "string") {
		if (choice === "auto" || choice === "none" || choice === "required")
			return choice;
		return "auto";
	}
	if (typeof choice === "object") {
		if (choice.type === "function" && "name" in choice) {
			return {
				type: "function",
				function: { name: choice.name },
			} satisfies ChatCompletionNamedToolChoice;
		}
		if (choice.type === "custom" && "name" in choice) {
			return {
				type: "custom",
				custom: { name: choice.name },
			} satisfies ChatCompletionNamedToolChoiceCustom;
		}
		if (choice.type === "shell") {
			return {
				type: "function",
				function: { name: "shell" },
			} satisfies ChatCompletionNamedToolChoice;
		}
		if (choice.type === "apply_patch") {
			return {
				type: "function",
				function: { name: "apply_patch" },
			} satisfies ChatCompletionNamedToolChoice;
		}
		if (
			choice.type === "allowed_tools" &&
			"mode" in choice &&
			"tools" in choice
		) {
			const allowedTools = mapOpenAIAllowedToolChoiceTools(
				Array.isArray((choice as { tools: unknown }).tools)
					? (choice as { tools: unknown[] }).tools
					: [],
				options,
			);
			if (allowedTools.length === 0) return undefined;
			return {
				type: "allowed_tools",
				allowed_tools: {
					mode: choice.mode as "auto" | "required",
					tools: allowedTools,
				},
			};
		}
	}
	return "auto";
}

function mapOpenAIAllowedToolChoiceTools(
	tools: unknown[],
	options: {
		onUnsupportedAllowedTool?: (tool: unknown) => void;
	},
): Record<string, unknown>[] {
	const mappedTools: Record<string, unknown>[] = [];
	for (const tool of tools) {
		const mapped = mapOpenAIAllowedToolChoiceTool(tool);
		if (mapped === null) {
			options.onUnsupportedAllowedTool?.(tool);
			continue;
		}
		if (Array.isArray(mapped)) {
			mappedTools.push(...mapped);
		} else {
			mappedTools.push(mapped);
		}
	}
	return mappedTools;
}

function mapOpenAIAllowedToolChoiceTool(
	tool: unknown,
): Record<string, unknown> | Record<string, unknown>[] | null {
	if (!isRecord(tool) || typeof tool.type !== "string") return null;
	if (tool.type === "function") {
		if (isRecord(tool.function) && typeof tool.function.name === "string") {
			return tool;
		}
		return typeof tool.name === "string"
			? { type: "function", function: { name: tool.name } }
			: null;
	}
	if (tool.type === "custom") {
		if (isRecord(tool.custom) && typeof tool.custom.name === "string") {
			return tool;
		}
		return typeof tool.name === "string"
			? { type: "custom", custom: { name: tool.name } }
			: null;
	}
	if (tool.type === "tool_search") {
		return { type: "function", function: { name: "tool_search" } };
	}
	const builtinDefinition = getBuiltinFunctionToolDefinition(tool.type);
	if (builtinDefinition) {
		return { type: "function", function: { name: builtinDefinition.name } };
	}
	if (
		tool.type === "namespace" &&
		typeof tool.name === "string" &&
		Array.isArray(tool.tools)
	) {
		const mappedTools: Record<string, unknown>[] = [];
		for (const nestedTool of tool.tools) {
			if (!isRecord(nestedTool) || typeof nestedTool.name !== "string") {
				continue;
			}
			mappedTools.push({
				type: "function",
				function: {
					name: flattenToolName({
						namespace: tool.name,
						name: nestedTool.name,
					}),
				},
			});
		}
		return mappedTools.length > 0 ? mappedTools : null;
	}
	return null;
}

function assertNoFunctionNameCollisions(tools: ChatCompletionTool[]): void {
	const seen = new Set<string>();
	for (const tool of tools) {
		if (tool.type !== "function") continue;
		const name = tool.function.name;
		if (seen.has(name)) {
			throw new AdapterError(
				ADAPTER_REQUEST_UNSUPPORTED_TOOL,
				`Unsupported Responses tool for OpenAI: function_name_collision. Multiple tools map to the same OpenAI function name: ${name}.`,
				{ provider: OPENAI_PROVIDER_NAME, model: "unknown" },
			);
		}
		seen.add(name);
	}
}

export class OpenAIToolIndexBuilder
	implements ChatToolIndexBuilder<ChatCompletionTool[], OpenAIToolSidecars>
{
	map(ctx: ResponsesContext, plan: CompatibilityPlan): OpenAIToolIndex {
		return createOpenAIToolIndex(ctx, plan);
	}
}

export class OpenAIToolChoiceMapper
	implements
		ChatToolChoiceMapper<
			ChatCompletionTool[],
			ChatCompletionToolChoiceOption,
			OpenAIToolSidecars
		>
{
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		toolIndex: OpenAIToolIndex,
	): ChatCompletionToolChoiceOption | undefined {
		if (ctx.request.tool_choice === "none") return undefined;
		if (!toolIndex.hasDeclarations()) {
			const requestedToolChoice = ctx.request.tool_choice;
			if (requestedToolChoice !== undefined && requestedToolChoice !== "auto") {
				ctx.addDiagnostic({
					code: "adapter.param.unsupported",
					severity: "warn",
					path: "tool_choice",
					action: "ignored",
					message:
						"OpenAI Chat Completions tool_choice was omitted because no provider tool entries remain.",
					metadata: {
						parameter: "tool_choice",
						value: requestedToolChoice,
					},
				});
			}
			return undefined;
		}

		if (
			ctx.request.tool_choice !== undefined &&
			isUnsupportedToolChoice(ctx.request.tool_choice, plan)
		) {
			ctx.addDiagnostic({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "degraded",
				message:
					"OpenAI Chat Completions does not support this Responses tool_choice shape directly; downgraded to a provider-compatible tool_choice.",
				metadata: {
					parameter: "tool_choice",
					value: ctx.request.tool_choice,
				},
			});
		}
		return mapOpenAIToolChoice(
			ctx.request.tool_choice as ResponseToolChoice | undefined,
			{
				onUnsupportedAllowedTool: (tool) => {
					ctx.addDiagnostic({
						code: "adapter.param.unsupported",
						severity: "warn",
						path: "tool_choice.allowed_tools.tools",
						action: "ignored",
						message:
							"OpenAI Chat Completions does not support this allowed_tools entry; omitted from upstream tool_choice.",
						metadata: {
							parameter: "tool_choice",
							value: tool,
						},
					});
				},
			},
		);
	}
}

function isUnsupportedToolChoice(
	choice: ResponseToolChoice,
	plan: CompatibilityPlan,
): boolean {
	if (typeof choice === "string") {
		return !plan.capabilities.toolChoice.supported.has(choice);
	}
	return !plan.capabilities.toolChoice.supported.has(choice.type);
}
