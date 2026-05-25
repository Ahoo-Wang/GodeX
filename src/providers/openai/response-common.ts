import { responseRequestEchoFields } from "../../adapter/response-utils";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { FinishReason } from "../../protocol/openai/shared";

type ResponseStatusFields = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
>;

interface ResponseObjectParts {
	output?: ResponseObject["output"];
	outputText?: string;
	usage?: ResponseUsage | null;
	completedAt?: number | null;
}

export function openAIStatusFields(
	finishReason: FinishReason | string | null | undefined,
): ResponseStatusFields {
	switch (finishReason) {
		case undefined:
		case null:
		case "stop":
		case "tool_calls":
		case "function_call":
			return { status: "completed" };
		case "length":
			return {
				status: "incomplete",
				incomplete_details: { reason: "max_output_tokens" },
			};
		case "content_filter":
			return {
				status: "incomplete",
				incomplete_details: { reason: "content_filter" },
			};
		default:
			return {
				status: "failed",
				error: {
					code: "server_error",
					message: `OpenAI finished with unsupported reason: ${finishReason}`,
				},
			};
	}
}

export function buildOpenAIResponseObject(
	ctx: ResponsesContext,
	status: ResponseStatusFields,
	parts: ResponseObjectParts = {},
): ResponseObject {
	return {
		id: ctx.responseId,
		object: "response",
		created_at: ctx.createdAt,
		...status,
		model: ctx.resolved.model,
		output: parts.output ?? [],
		...(parts.outputText !== undefined
			? { output_text: parts.outputText }
			: {}),
		...(parts.usage !== undefined ? { usage: parts.usage } : {}),
		...(parts.completedAt !== undefined
			? { completed_at: parts.completedAt }
			: {}),
		...responseRequestEchoFields(ctx),
	};
}

export function mapUsage(
	usage:
		| {
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
				completion_tokens_details?: { reasoning_tokens?: number };
				prompt_tokens_details?: { cached_tokens?: number };
		  }
		| undefined,
): ResponseUsage | undefined {
	if (!usage) return undefined;
	return {
		input_tokens: usage.prompt_tokens,
		output_tokens: usage.completion_tokens,
		total_tokens: usage.total_tokens,
		...(usage.prompt_tokens_details?.cached_tokens !== undefined
			? {
					input_tokens_details: {
						cached_tokens: usage.prompt_tokens_details.cached_tokens,
					},
				}
			: {}),
		...(usage.completion_tokens_details?.reasoning_tokens !== undefined
			? {
					output_tokens_details: {
						reasoning_tokens: usage.completion_tokens_details.reasoning_tokens,
					},
				}
			: {}),
	};
}
