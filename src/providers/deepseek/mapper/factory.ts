import { ChatRequestMapper } from "../../../adapter/mapper/chat/request-mapper";
import { ChatResponseMapper } from "../../../adapter/mapper/chat/response-mapper";
import { ChatStreamMapper } from "../../../adapter/mapper/chat/stream-mapper";
import type { ProviderMapper } from "../../../adapter/provider";
import { extractResponseOutputText } from "../../shared/response-message-payloads";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
	DeepSeekMessage,
	DeepSeekTool,
	DeepSeekToolChoice,
} from "../protocol/completions";
import { DeepSeekCompatibilityNegotiator } from "./compatibility";
import { DeepSeekFinishReasonMapper } from "./finish-reason";
import { DeepSeekMessageMapper } from "./messages";
import {
	DeepSeekRequestFactory,
	DeepSeekRequestOptionsMapper,
} from "./request-options";
import {
	DeepSeekResponseAccessor,
	DeepSeekResponseOutputMapper,
} from "./response-output";
import { DeepSeekStreamDeltaMapper } from "./stream-delta";
import { DeepSeekToolCallRestorer } from "./tool-calls";
import { DeepSeekToolChoiceMapper, DeepSeekToolIndexBuilder } from "./tools";
import { DeepSeekUsageMapper } from "./usage";

export function createDeepSeekMapper(): ProviderMapper<
	ChatCompletionRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	const finishReason = new DeepSeekFinishReasonMapper();
	return {
		request: new ChatRequestMapper<
			ChatCompletionRequest,
			DeepSeekMessage,
			DeepSeekTool[],
			DeepSeekToolChoice
		>({
			negotiator: new DeepSeekCompatibilityNegotiator(),
			factory: new DeepSeekRequestFactory(),
			messages: new DeepSeekMessageMapper(),
			tools: new DeepSeekToolIndexBuilder(),
			toolChoice: new DeepSeekToolChoiceMapper(),
			options: new DeepSeekRequestOptionsMapper(),
		}),
		response: new ChatResponseMapper({
			accessor: new DeepSeekResponseAccessor(),
			finishReason,
			output: new DeepSeekResponseOutputMapper(),
			usage: new DeepSeekUsageMapper(),
			outputText: extractResponseOutputText,
			emptyChoicesStatus: {
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
		}),
		stream: new ChatStreamMapper({
			delta: new DeepSeekStreamDeltaMapper(),
			finishReason,
			toolCall: new DeepSeekToolCallRestorer(),
			deferTerminal: true,
		}),
	};
}
