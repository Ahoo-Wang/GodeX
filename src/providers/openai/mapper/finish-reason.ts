import type { ChatFinishReasonMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseStatusFields } from "../../../adapter/mapper/chat/response-object-builder";
import type { FinishReason } from "../../../protocol/openai/shared";

export class OpenAIFinishReasonMapper
	implements ChatFinishReasonMapper<FinishReason | string>
{
	map(
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
}
