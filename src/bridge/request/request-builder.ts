import {
	BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
	BRIDGE_REQUEST_UNSUPPORTED_TOOL,
	BridgeError,
} from "../../error";
import type {
	ChatCompletionCreateRequest,
	ChatCompletionMessageParam,
	ChatCompletionToolChoiceOption,
} from "../../protocol/openai/completions";
import type {
	ResponseCreateRequest,
	ResponseToolChoice,
} from "../../protocol/openai/responses";
import type { ReasoningEffort } from "../../protocol/openai/shared";
import type { ResponseSessionSnapshot } from "../../session";
import {
	type ProviderCapabilities,
	planBridgeCompatibility,
} from "../compatibility";
import { type OutputContractPlan, planOutputContract } from "../output";
import {
	planTools,
	renderProviderToolDeclarations,
	type ToolPlan,
	type ToolPlanningProfile,
} from "../tools";
import {
	type InputNormalizerContext,
	type NormalizedChatMessage,
	normalizeCurrentInput,
	normalizeResponseItems,
} from "./input-normalizer";
import { buildChatMessages } from "./message-builder";

export interface BuildChatCompletionRequestInput {
	readonly request: ResponseCreateRequest;
	readonly provider: string;
	readonly model: string;
	readonly capabilities: ProviderCapabilities;
	readonly profile: ToolPlanningProfile;
	readonly session?: ResponseSessionSnapshot | null;
}

export interface BuildChatCompletionRequestResult {
	readonly request: ChatCompletionCreateRequest;
	readonly compatibility: ReturnType<typeof planBridgeCompatibility>;
	readonly tools: ToolPlan;
	readonly output: OutputContractPlan;
}

export { buildChatMessages, type NormalizedChatMessage, normalizeCurrentInput };

export function buildChatCompletionRequest(
	input: BuildChatCompletionRequestInput,
): BuildChatCompletionRequestResult {
	const compatibility = planBridgeCompatibility({
		provider: input.provider,
		model: input.model,
		request: input.request,
		capabilities: input.capabilities,
	});
	const tools = planTools({
		tools: input.request.tools,
		toolChoice: input.request.tool_choice,
		profile: input.profile,
	});
	assertNoRejectedCompatibility(input, compatibility);
	const output = planOutputContract({
		format: input.request.text?.format,
		responseFormatDecision: compatibility.responseFormat,
	});
	const request: ChatCompletionCreateRequest = {
		model: input.model,
		messages: chatMessages(input, output, tools),
	};

	applyTools(request, input, tools);
	if (output.providerResponseFormat !== undefined) {
		request.response_format =
			output.providerResponseFormat as ChatCompletionCreateRequest["response_format"];
	}
	applyRequestOptions(
		request,
		input.request,
		input.capabilities,
		input.provider,
		input.model,
	);

	return { request, compatibility, tools, output };
}

function chatMessages(
	input: BuildChatCompletionRequestInput,
	output: OutputContractPlan,
	tools: ToolPlan,
): ChatCompletionMessageParam[] {
	const context = normalizerContext(input, tools);
	const history = input.session?.input_items
		? normalizeResponseItems(input.session.input_items, input.request, context)
		: [];
	const current = normalizeCurrentInput(input.request, context);
	const currentPrefixLength = systemPrefixLength(current);
	const preamble = current.slice(0, currentPrefixLength);
	if (output.syntheticInstruction) {
		preamble.push({
			role: "system",
			content: output.syntheticInstruction,
		});
	}
	return buildChatMessages([
		...preamble,
		...history,
		...current.slice(currentPrefixLength),
	]);
}

function systemPrefixLength(
	messages: readonly NormalizedChatMessage[],
): number {
	const firstNonSystem = messages.findIndex(
		(message) => message.role !== "system",
	);
	return firstNonSystem === -1 ? messages.length : firstNonSystem;
}

function assertNoRejectedCompatibility(
	input: BuildChatCompletionRequestInput,
	compatibility: ReturnType<typeof planBridgeCompatibility>,
): void {
	const responseFormat = compatibility.responseFormat;
	if (responseFormat?.action !== "rejected") return;
	throw new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
		responseFormat.reason ??
			`text.format is not supported by provider ${input.provider}.`,
		{
			provider: input.provider,
			model: input.model,
			parameter: "text.format",
		},
	);
}

function applyTools(
	request: ChatCompletionCreateRequest,
	input: BuildChatCompletionRequestInput,
	tools: ToolPlan,
): void {
	if (input.request.tool_choice === "none" || !tools.enabled) return;

	const declarations = renderProviderToolDeclarations(tools.declarations);
	if (declarations.length !== tools.declarations.length) {
		throw new BridgeError(
			BRIDGE_REQUEST_UNSUPPORTED_TOOL,
			`Provider-native tool rendering is not implemented for provider ${input.provider}: ${unrenderedProviderToolTypes(tools).join(", ")}.`,
			{
				provider: input.provider,
				model: input.model,
				parameter: "tools",
			},
		);
	}

	request.tools =
		declarations as unknown as ChatCompletionCreateRequest["tools"];
	const providerToolChoice = chatToolChoice(tools.providerToolChoice);
	if (providerToolChoice !== undefined) {
		request.tool_choice = providerToolChoice;
	}
}

function applyRequestOptions(
	request: ChatCompletionCreateRequest,
	source: ResponseCreateRequest,
	capabilities: ProviderCapabilities,
	provider: string,
	model: string,
): void {
	if (
		source.stream === true &&
		capabilities.parameters.supported.has("stream")
	) {
		request.stream = true;
		if (capabilities.streaming.usage) {
			request.stream_options = { include_usage: true };
		}
	}
	if (
		typeof source.temperature === "number" &&
		capabilities.parameters.supported.has("temperature")
	) {
		request.temperature = source.temperature;
	}
	if (
		typeof source.top_p === "number" &&
		capabilities.parameters.supported.has("top_p")
	) {
		request.top_p = source.top_p;
	}
	if (
		typeof source.max_output_tokens === "number" &&
		capabilities.parameters.supported.has("max_output_tokens")
	) {
		request.max_tokens = source.max_output_tokens;
	}
	if (
		source.reasoning?.effort &&
		capabilities.parameters.supported.has("reasoning")
	) {
		applyReasoningOption(request, source, capabilities, provider, model);
	}
	if (
		source.safety_identifier &&
		capabilities.parameters.supported.has("safety_identifier")
	) {
		request.user_id = source.safety_identifier;
		return;
	}
	if (source.user && capabilities.parameters.supported.has("user")) {
		request.user_id = source.user;
	}
}

function applyReasoningOption(
	request: ChatCompletionCreateRequest,
	source: ResponseCreateRequest,
	capabilities: ProviderCapabilities,
	provider: string,
	model: string,
): void {
	const effort = source.reasoning?.effort;
	if (!effort) return;
	if (!isReasoningEffort(effort)) {
		throw new BridgeError(
			BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
			`Unsupported reasoning.effort value for provider ${provider}: ${String(effort)}.`,
			{ provider, model, parameter: "reasoning.effort", value: effort },
		);
	}
	switch (capabilities.reasoning.effort) {
		case "native":
			request.reasoning_effort =
				effort as ChatCompletionCreateRequest["reasoning_effort"];
			return;
		case "boolean":
			request.thinking = {
				type: effort === "none" ? "disabled" : "enabled",
			};
			return;
		case "none":
			return;
		default:
			unsupportedReasoningCapabilityMode(
				capabilities.reasoning.effort,
				provider,
				model,
			);
	}
}

function unsupportedReasoningCapabilityMode(
	mode: never,
	provider: string,
	model: string,
): never {
	throw new BridgeError(
		BRIDGE_REQUEST_UNSUPPORTED_PARAMETER,
		`Unsupported provider reasoning.effort mode for ${provider}: ${String(mode)}.`,
		{
			provider,
			model,
			parameter: "reasoning.effort.mode",
			value: mode,
		},
	);
}

const REASONING_EFFORTS = new Set<ReasoningEffort>([
	"none",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
]);

function isReasoningEffort(value: unknown): value is ReasoningEffort {
	return (
		typeof value === "string" && REASONING_EFFORTS.has(value as ReasoningEffort)
	);
}

function chatToolChoice(
	toolChoice: ResponseToolChoice | undefined,
): ChatCompletionToolChoiceOption | undefined {
	if (toolChoice === undefined || toolChoice === "none") return undefined;
	if (typeof toolChoice === "string") return toolChoice;
	if (toolChoice.type === "function") {
		return { type: "function", function: { name: toolChoice.name } };
	}
	if (toolChoice.type === "custom") {
		return { type: "custom", custom: { name: toolChoice.name } };
	}
	return undefined;
}

function unrenderedProviderToolTypes(tools: ToolPlan): string[] {
	return [
		...new Set(
			tools.declarations
				.filter((tool) => tool.providerType !== "function")
				.map((tool) => tool.providerType),
		),
	];
}

function normalizerContext(
	input: BuildChatCompletionRequestInput,
	tools?: ToolPlan,
): InputNormalizerContext {
	return {
		provider: input.provider,
		model: input.model,
		toolPlan: tools,
	};
}
