import { SERVER_ERROR } from "../../error";
import type {
	ResponseIncompleteDetails,
	ResponseStatus,
} from "../../protocol/openai/responses";
import type { ResponseError } from "../../protocol/openai/shared";

export type TerminalResponseStatus = Extract<
	ResponseStatus,
	"completed" | "incomplete" | "failed"
>;

export interface ProviderFinishReasonFields {
	readonly status: TerminalResponseStatus;
	readonly error: ResponseError | null;
	readonly incomplete_details: ResponseIncompleteDetails | null;
}

export function mapProviderFinishReason(
	provider: string,
	finishReason: string | null | undefined,
): ProviderFinishReasonFields {
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
		case "network_error":
			return {
				status: "failed",
				error: {
					code: SERVER_ERROR,
					message: `Provider ${provider} reported network_error finish reason.`,
				},
				incomplete_details: null,
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
