import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseObject } from "../../protocol/openai/responses";
import {
	buildChatResponseObject,
	type ResponseObjectParts,
	type ResponseStatusFields,
} from "../shared/response-object";
import type { FinishReason } from "./protocol/completions";

export function buildZhipuResponseObject(
	ctx: ResponsesContext,
	status: ResponseStatusFields,
	parts: ResponseObjectParts = {},
): ResponseObject {
	return buildChatResponseObject(ctx, status, parts);
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
