import type { CompatibilityPlan } from "../../../adapter/mapper/chat/compatibility-plan";
import type {
	ChatToolChoiceMapper,
	ChatToolMapper,
} from "../../../adapter/mapper/chat/contract";
import { isRecord } from "../../../adapter/utils";
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
import { flattenToolName } from "../../shared/tool-identity";
import { toDeepSeekFunctionName } from "../function-names";
import type { DeepSeekTool, DeepSeekToolChoice } from "../protocol/completions";
import { DEEPSEEK_PROVIDER_NAME } from "../provider";

type UnsupportedToolMode = "throw" | "skip";

interface MapToolsOptions {
	unsupported?: UnsupportedToolMode;
	onUnsupported?: (type: string) => void;
	onDegraded?: (type: string, effectiveType: string) => void;
	supportedToolTypes?: ReadonlySet<string>;
	degradedToolTypes?: ReadonlyMap<string, string>;
}

const TOOL_SEARCH_PARAMETERS = {
	type: "object",
	properties: {
		query: {
			type: "string",
			description: "Search query for matching tools.",
		},
	},
	required: ["query"],
} satisfies Record<string, unknown>;

export function mapDeepSeekTools(
	tools: ResponseTool[] | undefined,
	options: MapToolsOptions = {},
): DeepSeekTool[] {
	if (!tools) return [];

	const result: DeepSeekTool[] = [];
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
): DeepSeekTool | DeepSeekTool[] | null {
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
		case "function":
			return functionTool(
				tool.name,
				tool.description,
				tool.parameters,
				tool.strict,
			);
		case "local_shell":
		case "shell":
		case "apply_patch":
			return builtinFunctionTool(tool.type);
		case "custom":
			return functionTool(
				tool.name,
				degradedCustomToolDescription(tool),
				degradedCustomToolParameters(tool),
			);
		case "tool_search":
			return functionTool(
				"tool_search",
				tool.description ??
					"Search available tools by query before choosing which tool to call.",
				objectSchemaOrDefault(tool.parameters, TOOL_SEARCH_PARAMETERS),
			);
		case "namespace":
			return tool.tools.map((nestedTool) => {
				const name = flattenToolName({
					namespace: tool.name,
					name: nestedTool.name,
				});
				const description =
					nestedTool.description ?? `${tool.description} (${nestedTool.name})`;
				if (nestedTool.type === "function") {
					return functionTool(
						name,
						description,
						objectSchemaOrDefault(
							nestedTool.parameters,
							defaultNamespaceFunctionParameters(),
						),
						typeof nestedTool.strict === "boolean"
							? nestedTool.strict
							: undefined,
					);
				}
				return functionTool(
					name,
					degradedCustomToolDescription(nestedTool, description),
					degradedCustomToolParameters(nestedTool),
				);
			});
		default:
			return handleUnsupportedTool(
				tool.type,
				"This Responses tool type is not supported by the DeepSeek adapter.",
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

function functionTool(
	name: string,
	description: string | undefined,
	parameters: Record<string, unknown>,
	strict?: boolean,
): DeepSeekTool {
	return {
		type: "function",
		function: {
			name: toDeepSeekFunctionName(name),
			...(description ? { description } : {}),
			parameters,
			...(strict !== undefined ? { strict } : {}),
		},
	};
}

function builtinFunctionTool(
	type: "local_shell" | "shell" | "apply_patch",
): DeepSeekTool {
	const definition = getBuiltinFunctionToolDefinition(type);
	if (!definition) {
		throw unsupportedTool(type, "Missing built-in tool definition.");
	}
	return functionTool(
		definition.name,
		definition.description,
		definition.parameters,
	);
}

function objectSchemaOrDefault(
	value: unknown,
	fallback: Record<string, unknown>,
): Record<string, unknown> {
	return isRecord(value) && value.type === "object" ? value : fallback;
}

function defaultNamespaceFunctionParameters(): Record<string, unknown> {
	return {
		type: "object",
		properties: { input: { type: "string" } },
	};
}

function unsupportedTool(type: string, message: string): AdapterError {
	return new AdapterError(
		ADAPTER_REQUEST_UNSUPPORTED_TOOL,
		`Unsupported Responses tool for DeepSeek: ${type}. ${message}`,
		{ provider: DEEPSEEK_PROVIDER_NAME, model: "unknown" },
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
			`DeepSeek accepts at most ${maxTools} mapped tools; received ${toolCount}.`,
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

function assertNoFunctionNameCollisions(tools: DeepSeekTool[]): void {
	const seen = new Set<string>();
	for (const tool of tools) {
		const name = tool.function.name;
		if (seen.has(name)) {
			throw unsupportedTool(
				"function_name_collision",
				`Multiple tools map to the same DeepSeek function name: ${name}.`,
			);
		}
		seen.add(name);
	}
}

export function mapDeepSeekToolChoice(
	choice: ResponseToolChoice | undefined,
): DeepSeekToolChoice | undefined {
	if (choice === undefined || choice === "none") return undefined;
	if (choice === "auto" || choice === "required") return choice;
	if (typeof choice === "object" && choice.type === "function") {
		return {
			type: "function",
			function: { name: toDeepSeekFunctionName(choice.name) },
		};
	}
	if (typeof choice === "object" && choice.type === "custom") {
		return {
			type: "function",
			function: { name: toDeepSeekFunctionName(choice.name) },
		};
	}
	if (typeof choice === "object" && choice.type === "shell") {
		return { type: "function", function: { name: "shell" } };
	}
	if (typeof choice === "object" && choice.type === "apply_patch") {
		return { type: "function", function: { name: "apply_patch" } };
	}
	return "auto";
}

export class DeepSeekToolMapper implements ChatToolMapper<DeepSeekTool[]> {
	map(
		ctx: ResponsesContext,
		plan: CompatibilityPlan,
	): DeepSeekTool[] | undefined {
		const toolsDisabled = ctx.request.tool_choice === "none";
		const tools = toolsDisabled
			? []
			: mapDeepSeekTools(ctx.request.tools, {
					supportedToolTypes: plan.capabilities.tools.supported,
					degradedToolTypes: plan.capabilities.tools.degraded,
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
						const message = `DeepSeek maps Responses tool '${type}' to ${effectiveType}; provider-native tool semantics may not be enforced.`;
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
		return tools.length > 0 ? tools : undefined;
	}
}

export class DeepSeekToolChoiceMapper
	implements ChatToolChoiceMapper<DeepSeekTool[], DeepSeekToolChoice>
{
	map(
		ctx: ResponsesContext,
		_plan: CompatibilityPlan,
		tools: DeepSeekTool[] | undefined,
	): DeepSeekToolChoice | undefined {
		const requestedToolChoice = ctx.request.tool_choice;
		if (isThinkingMode(ctx) && requestedToolChoice !== undefined) {
			ctx.addDiagnostic({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "ignored",
				message:
					"DeepSeek V4 thinking mode rejects tool_choice; omitted from upstream request.",
				metadata: {
					parameter: "tool_choice",
					value: requestedToolChoice,
				},
			});
			return undefined;
		}
		if (!tools || tools.length === 0) return undefined;
		if (isUnsupportedToolChoice(requestedToolChoice)) {
			ctx.addDiagnostic({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "degraded",
				message:
					"DeepSeek Chat Completions does not support this Responses tool_choice directly; downgraded to a provider-compatible tool_choice.",
				metadata: {
					parameter: "tool_choice",
					value: requestedToolChoice,
				},
			});
		}
		return mapDeepSeekToolChoice(requestedToolChoice);
	}
}

function isThinkingMode(ctx: ResponsesContext): boolean {
	return (
		ctx.request.reasoning?.effort !== undefined &&
		ctx.request.reasoning.effort !== "none"
	);
}

function isUnsupportedToolChoice(
	choice: ResponseToolChoice | undefined,
): boolean {
	if (choice === undefined) return false;
	if (
		choice === "auto" ||
		choice === "none" ||
		choice === "required" ||
		(typeof choice === "object" && choice.type === "function")
	) {
		return false;
	}
	return true;
}
