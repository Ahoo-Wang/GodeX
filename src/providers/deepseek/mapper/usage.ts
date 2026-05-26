import type { ChatUsageMapper } from "../../../adapter/mapper/chat/contract";
import type { ResponseUsage } from "../../../protocol/openai/responses";
import type { ChatCompletion } from "../protocol/completions";

export class DeepSeekUsageMapper implements ChatUsageMapper<ChatCompletion> {
	map(_source: ChatCompletion): ResponseUsage | undefined {
		return undefined;
	}
}
