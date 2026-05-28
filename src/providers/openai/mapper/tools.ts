import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatToolChoiceMapper,
	ChatToolMapper,
} from "../../../adapter/mapper/chat/contract";
import { isRecord } from "../../../adapter/utils";
import type { ResponsesContext } from "../../../context/responses-context";
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

export interface OpenAIMappedTools {
	tools: ChatCompletionTool[];
	webSearchOptions: ChatCompletionWebSearchOptions | undefined;
}

interface MapOpenAIToolsOptions {
	supportedToolTypes?: ReadonlySet<string>;
	onUnsupported?: (type: string) => void;
	onDegraded?: (type: string) => void;
}

const OPENAI_MAPPED_TOOLS_ATTRIBUTE = "openai.mapped-tools";

export function getOpenAIMappedTools(
	ctx: ResponsesContext,
	plan: CompatibilityPlan,
): OpenAIMappedTools {
	const cached = ctx.attributes.get(OPENAI_MAPPED_TOOLS_ATTRIBUTE);
	if (cached) return cached as OpenAIMappedTools;

	const mapped =
		ctx.request.tool_choice === "none"
			? { tools: [], webSearchOptions: undefined }
			: mapOpenAITools(ctx.request.tools, {
					supportedToolTypes: plan.capabilities.tools.supported,
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
					onDegraded: (type) => {
						ctx.addDiagnostic({
							code: "adapter.tool.degraded",
							severity: "warn",
							path: `tools[type=${type}]`,
							action: "degraded",
							message: `Responses tool '${type}' was mapped to OpenAI Chat Completions web_search_options.`,
							metadata: { toolType: type },
						});
					},
				});
	ctx.attributes.set(OPENAI_MAPPED_TOOLS_ATTRIBUTE, mapped);
	return mapped;
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
		switch (type) {
			case "function": {
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
				options.onDegraded?.(type);
				break;
			}
			case "web_search_preview":
			case "web_search_preview_2025_03_11": {
				webSearchOptions = mapWebSearchOptionsFromTool(tool);
				options.onDegraded?.(type);
				break;
			}
			case "local_shell":
			case "shell":
			case "apply_patch": {
				const def = getBuiltinFunctionToolDefinition(tool.type);
				if (def) {
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
				mappedTools.push(
					toolSearchToFunctionTool(tool.description, tool.parameters),
				);
				break;
			}
			case "namespace": {
				for (const nestedTool of tool.tools) {
					if (nestedTool.type === "function") {
						mappedTools.push({
							type: "function",
							function: {
								name: `${tool.name}__${nestedTool.name}`,
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
						mappedTools.push({
							type: "function",
							function: {
								name: `${tool.name}__${nestedTool.name}`,
								description:
									nestedTool.description ??
									`${tool.description} (${nestedTool.name})`,
								parameters: {
									type: "object",
									properties: { input: { type: "string" } },
									required: ["input"],
								},
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
		if (
			choice.type === "allowed_tools" &&
			"mode" in choice &&
			"tools" in choice
		) {
			return {
				type: "allowed_tools",
				allowed_tools: {
					mode: choice.mode as "auto" | "required",
					tools: (choice as { tools: Record<string, unknown>[] }).tools,
				},
			};
		}
	}
	return "auto";
}

export class OpenAIToolMapper implements ChatToolMapper<ChatCompletionTool[]> {
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
	): ChatCompletionTool[] | undefined {
		const mapped = getOpenAIMappedTools(ctx, plan).tools;
		return mapped.length > 0 ? mapped : undefined;
	}
}

export class OpenAIToolChoiceMapper
	implements
		ChatToolChoiceMapper<ChatCompletionTool[], ChatCompletionToolChoiceOption>
{
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
		tools: ChatCompletionTool[] | undefined,
	): ChatCompletionToolChoiceOption | undefined {
		if (ctx.request.tool_choice === "none") return undefined;
		if (!tools || tools.length === 0) {
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
					"OpenAI Chat Completions does not support this Responses tool_choice shape; downgraded to auto.",
				metadata: {
					parameter: "tool_choice",
					value: ctx.request.tool_choice,
				},
			});
		}
		return mapOpenAIToolChoice(
			ctx.request.tool_choice as ResponseToolChoice | undefined,
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
