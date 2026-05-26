import type { ChatFinishReasonMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseStatusFields } from "../../../adapter/mapper/chat/response-object-builder";
import type { FinishReason } from "../protocol/completions";

export class DeepSeekFinishReasonMapper
	implements ChatFinishReasonMapper<FinishReason>
{
	map(
		_finishReason: FinishReason | string | null | undefined,
	): ResponseStatusFields {
		return { status: "completed" };
	}
}
