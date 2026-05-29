import { SERVER_ERROR } from "../../error";
import type {
	ResponseIncompleteDetails,
	ResponseObject,
	ResponseStatus,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { ResponseError } from "../../protocol/openai/shared";
import { validateOutputContract } from "../output";
import type { ChatCompletionResponseAccessor } from "../provider-spec";
import {
	type ProviderFunctionCall,
	restoreToolCall,
} from "../tools/call-restorer";
import { ToolIdentityMap } from "../tools/tool-identity";
import type { ToolPlan } from "../tools/tool-plan";

type TerminalResponseStatus = Extract<
	ResponseStatus,
	"completed" | "incomplete" | "failed"
>;

interface ReconstructResponseObjectInput<TResponse> {
	readonly requestId: string;
	readonly responseId: string;
	readonly createdAt: number;
	readonly provider: string;
	readonly model: string;
	readonly providerResponse: TResponse;
	readonly accessor: ChatCompletionResponseAccessor<TResponse>;
	readonly toolIdentity?: unknown;
	readonly outputContract: { readonly requiresValidJson: boolean };
	readonly echo?: Partial<ResponseObject>;
	readonly nowSeconds?: () => number;
}

interface ResponseStatusFields {
	readonly status: TerminalResponseStatus;
	readonly error: ResponseError | null;
	readonly incomplete_details: ResponseIncompleteDetails | null;
}

export function reconstructResponseObject<TResponse>(
	input: ReconstructResponseObjectInput<TResponse>,
): ResponseObject {
	const firstChoice = input.accessor.firstChoice(input.providerResponse);
	if (!firstChoice) {
		return buildResponseObject(input, {
			status: "failed",
			outputText: "",
			usage: null,
			includeAssistantMessage: false,
			statusFields: {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${input.provider} returned no choices.`,
				},
				incomplete_details: null,
			},
		});
	}

	const outputText = input.accessor.outputText(input.providerResponse);
	validateOutputContract({
		requiresValidJson: input.outputContract.requiresValidJson,
		outputText,
		provider: input.provider,
		model: input.model,
		responseId: input.responseId,
	});

	const statusFields = mapFinishReason(
		input.provider,
		input.accessor.finishReason(input.providerResponse),
	);

	return buildResponseObject(input, {
		status: statusFields.status,
		outputText,
		usage: input.accessor.usage(input.providerResponse),
		includeAssistantMessage:
			outputText.length > 0 || providerToolCalls(firstChoice).length === 0,
		toolCalls: providerToolCalls(firstChoice),
		reasoningText: providerReasoningText(firstChoice),
		statusFields,
	});
}

function mapFinishReason(
	provider: string,
	finishReason: string | null | undefined,
): ResponseStatusFields {
	switch (finishReason) {
		case "stop":
		case "tool_calls":
			return {
				status: "completed",
				error: null,
				incomplete_details: null,
			};
		case undefined:
		case null:
			return {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${provider} returned no finish reason.`,
				},
				incomplete_details: null,
			};
		case "length":
		case "model_context_window_exceeded":
			return {
				status: "incomplete",
				error: null,
				incomplete_details: { reason: "max_output_tokens" },
			};
		case "content_filter":
		case "sensitive":
			return {
				status: "incomplete",
				error: null,
				incomplete_details: { reason: "content_filter" },
			};
		default:
			return {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${provider} returned unexpected finish reason: ${finishReason}.`,
				},
				incomplete_details: null,
			};
	}
}

function buildResponseObject<TResponse>(
	input: ReconstructResponseObjectInput<TResponse>,
	parts: {
		readonly status: TerminalResponseStatus;
		readonly outputText: string;
		readonly usage: ResponseUsage | null;
		readonly includeAssistantMessage: boolean;
		readonly toolCalls?: readonly ProviderFunctionCall[];
		readonly reasoningText?: string;
		readonly statusFields: ResponseStatusFields;
	},
): ResponseObject {
	const output = responseOutput(input, parts);
	return {
		id: input.responseId,
		object: "response",
		created_at: input.createdAt,
		completed_at: input.nowSeconds?.() ?? Math.floor(Date.now() / 1000),
		status: parts.status,
		model: input.model,
		...input.echo,
		output,
		output_text: parts.outputText,
		usage: parts.usage,
		error: parts.statusFields.error,
		incomplete_details: parts.statusFields.incomplete_details,
	};
}

function responseOutput<TResponse>(
	input: ReconstructResponseObjectInput<TResponse>,
	parts: {
		readonly outputText: string;
		readonly includeAssistantMessage: boolean;
		readonly toolCalls?: readonly ProviderFunctionCall[];
		readonly reasoningText?: string;
		readonly status: TerminalResponseStatus;
	},
): ResponseObject["output"] {
	const output: ResponseObject["output"] = [];
	if (parts.reasoningText) {
		output.push({
			id: `rs_${input.responseId}`,
			type: "reasoning",
			status: "completed",
			summary: [],
			content: [{ type: "reasoning_text", text: parts.reasoningText }],
		});
	}
	const identities = toolIdentities(input.toolIdentity);
	for (const call of parts.toolCalls ?? []) {
		output.push(restoreToolCall(call, identities));
	}
	if (parts.includeAssistantMessage) {
		output.push(
			assistantMessage(input.responseId, parts.outputText, parts.status),
		);
	}
	return output;
}

function assistantMessage(
	responseId: string,
	text: string,
	responseStatus: TerminalResponseStatus,
): ResponseObject["output"][number] {
	return {
		id: `msg_${responseId}`,
		type: "message",
		role: "assistant",
		status: responseStatus === "incomplete" ? "incomplete" : "completed",
		content: [{ type: "output_text", text }],
	};
}

function toolIdentities(tools: unknown): ToolIdentityMap {
	const identities = new ToolIdentityMap();
	if (isRecord(tools) && Array.isArray(tools.declarations)) {
		identities.addDeclarations(tools.declarations as ToolPlan["declarations"]);
	}
	return identities;
}

function providerToolCalls(choice: unknown): ProviderFunctionCall[] {
	if (!isRecord(choice)) return [];
	const message = choice.message;
	if (!isRecord(message) || !Array.isArray(message.tool_calls)) return [];
	return message.tool_calls.flatMap((toolCall): ProviderFunctionCall[] => {
		if (!isRecord(toolCall)) return [];
		const fn = toolCall.function;
		if (!isRecord(fn)) return [];
		if (typeof toolCall.id !== "string") return [];
		if (typeof fn.name !== "string") return [];
		if (typeof fn.arguments !== "string") return [];
		return [
			{
				callId: toolCall.id,
				name: fn.name,
				arguments: fn.arguments,
			},
		];
	});
}

function providerReasoningText(choice: unknown): string | undefined {
	if (!isRecord(choice) || !isRecord(choice.message)) return undefined;
	return typeof choice.message.reasoning_content === "string" &&
		choice.message.reasoning_content.length > 0
		? choice.message.reasoning_content
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
