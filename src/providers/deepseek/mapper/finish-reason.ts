import type { ChatFinishReasonMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseStatusFields } from "../../../adapter/mapper/chat/response-object-builder";
import type { FinishReason } from "../protocol/completions";

export class DeepSeekFinishReasonMapper
	implements ChatFinishReasonMapper<FinishReason | string>
{
	map(
		_finishReason: FinishReason | string | null | undefined,
	): ResponseStatusFields {
		switch (_finishReason) {
			case "stop":
			case "tool_calls":
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
			case "insufficient_system_resource":
				return {
					status: "failed",
					error: {
						code: "server_error",
						message: "DeepSeek insufficient system resource",
					},
				};
			default:
				return {
					status: "failed",
					error: {
						code: "server_error",
						message: `Unexpected DeepSeek finish reason: ${String(_finishReason)}`,
					},
				};
		}
	}
}
