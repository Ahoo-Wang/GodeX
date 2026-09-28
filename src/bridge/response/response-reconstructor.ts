import { SERVER_ERROR } from "../../error";
import type {
	ResponseObject,
	ResponseUsage,
} from "../../protocol/openai/responses";
import {
	mapProviderFinishReason,
	type ProviderFinishReasonFields,
	type TerminalResponseStatus,
} from "../finish-reason";
import { validateOutputContract } from "../output";
import type { ChatCompletionResponseAccessor } from "../provider-spec";
import {
	type ProviderFunctionCall,
	restoreToolCall,
} from "../tools/call-restorer";
import { ToolIdentityMap } from "../tools/tool-identity";
import type { ToolPlan } from "../tools/tool-plan";

interface ReconstructResponseObjectInput<TResponse> {
	readonly requestId: string;
	readonly responseId: string;
	readonly createdAt: number;
	readonly completedAt: number;
	readonly provider: string;
	readonly model: string;
	readonly providerResponse: TResponse;
	readonly accessor: ChatCompletionResponseAccessor<TResponse>;
	readonly toolIdentity?: unknown;
	readonly outputContract: { readonly requiresValidJson: boolean };
	readonly echo?: Partial<ResponseObject>;
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

	const statusFields = mapProviderFinishReason(
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
		reasoningText: input.accessor.reasoningText?.(input.providerResponse),
		statusFields,
	});
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
		readonly statusFields: ProviderFinishReasonFields;
	},
): ResponseObject {
	const output = responseOutput(input, parts);
	return {
		id: input.responseId,
		object: "response",
		created_at: input.createdAt,
		completed_at: input.completedAt,
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
	const output: ResponseObject["output"] = [
		...(input.accessor.webSearchCalls?.(input.providerResponse) ?? []),
	];
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
