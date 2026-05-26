import type {
	ChatResponseAccessor,
	ChatResponseOutputMapper,
} from "../../../adapter/mapper/chat/contract";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseItem } from "../../../protocol/openai/responses";
import type { ChatCompletion, FinishReason } from "../protocol/completions";

export class DeepSeekResponseAccessor
	implements
		ChatResponseAccessor<ChatCompletion, ChatCompletion["choices"][0], FinishReason>
{
	firstChoice(
		source: ChatCompletion,
	): ChatCompletion["choices"][0] | undefined {
		return source.choices?.[0];
	}

	finishReason(
		choice: ChatCompletion["choices"][0] | undefined,
	): FinishReason | undefined {
		return choice?.finish_reason;
	}
}

export class DeepSeekResponseOutputMapper
	implements ChatResponseOutputMapper<ChatCompletion>
{
	map(_ctx: ResponsesContext, _result: ChatCompletion): ResponseItem[] {
		return [];
	}
}
