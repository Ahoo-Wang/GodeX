import { ADAPTER_REQUEST_UNSUPPORTED_TOOL, AdapterError } from "../../error";
import type {
	ChatCompletionCreateRequest,
	ChatCompletionMessageParam,
	ChatCompletionToolChoiceOption,
} from "../../protocol/openai/completions";
import type {
	ResponseCreateRequest,
	ResponseToolChoice,
} from "../../protocol/openai/responses";
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
	const output = planOutputContract({
		format: input.request.text?.format,
		responseFormatDecision: compatibility.responseFormat,
	});
	const request: ChatCompletionCreateRequest = {
		model: input.model,
		messages: chatMessages(input, output),
	};

	applyTools(request, input, tools);
	if (output.providerResponseFormat !== undefined) {
		request.response_format =
			output.providerResponseFormat as ChatCompletionCreateRequest["response_format"];
	}
	applyRequestOptions(request, input.request, input.capabilities);

	return { request, compatibility, tools, output };
}

function chatMessages(
	input: BuildChatCompletionRequestInput,
	output: OutputContractPlan,
): ChatCompletionMessageParam[] {
	const messages = buildChatMessages([
		...(input.session?.input_items
			? normalizeResponseItems(
					input.session.input_items,
					input.request,
					normalizerContext(input),
				)
			: []),
		...normalizeCurrentInput(input.request, normalizerContext(input)),
	]);
	if (output.syntheticInstruction) {
		messages.push({
			role: "system",
			content: output.syntheticInstruction,
		});
	}
	return messages;
}

function applyTools(
	request: ChatCompletionCreateRequest,
	input: BuildChatCompletionRequestInput,
	tools: ToolPlan,
): void {
	if (input.request.tool_choice === "none" || !tools.enabled) return;

	const declarations = renderProviderToolDeclarations(tools.declarations);
	if (declarations.length !== tools.declarations.length) {
		throw new AdapterError(
			ADAPTER_REQUEST_UNSUPPORTED_TOOL,
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
		request.reasoning_effort = source.reasoning
			.effort as ChatCompletionCreateRequest["reasoning_effort"];
	}
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
): InputNormalizerContext {
	return { provider: input.provider, model: input.model };
}
