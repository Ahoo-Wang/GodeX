import { responseRequestEchoFields } from "../../adapter/response-utils";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { FinishReason } from "./protocol/completions";

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

export function buildZhipuResponseObject(
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

export function zhipuStatusFields(
	finishReason: FinishReason | string | null | undefined,
): ResponseStatusFields {
	switch (finishReason) {
		case undefined:
		case null:
		case "stop":
		case "tool_calls":
			return { status: "completed" };
		case "length":
		case "model_context_window_exceeded":
			return {
				status: "incomplete",
				incomplete_details: { reason: "max_output_tokens" },
			};
		case "sensitive":
			return {
				status: "incomplete",
				incomplete_details: { reason: "content_filter" },
			};
		case "network_error":
			return {
				status: "failed",
				error: {
					code: "server_error",
					message: "Zhipu finished with reason: network_error",
				},
			};
		default:
			return {
				status: "failed",
				error: {
					code: "server_error",
					message: `Zhipu finished with unsupported reason: ${finishReason}`,
				},
			};
	}
}
