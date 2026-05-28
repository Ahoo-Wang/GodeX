import { ChatRequestMapper } from "../../../adapter/mapper/chat/request-mapper";
import { ChatResponseMapper } from "../../../adapter/mapper/chat/response-mapper";
import { ChatStreamMapper } from "../../../adapter/mapper/chat/stream-mapper";
import type { ProviderMapper } from "../../../adapter/provider";
import { extractResponseOutputText as extractZhipuOutputText } from "../../shared/response-message-payloads";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
	ChatTool,
	TextMessage,
	ToolChoice,
} from "../protocol/completions";
import { ZhipuCompatibilityNegotiator } from "./compatibility";
import { ZhipuFinishReasonMapper } from "./finish-reason";
import { ZhipuMessageMapper } from "./messages";
import {
	ZhipuRequestFactory,
	ZhipuRequestOptionsMapper,
} from "./request-options";
import {
	ZhipuResponseAccessor,
	ZhipuResponseOutputMapper,
} from "./response-output";
import { ZhipuStreamDeltaMapper } from "./stream-delta";
import { ZhipuToolCallRestorer } from "./tool-calls";
import { ZhipuToolChoiceMapper, ZhipuToolIndexBuilder } from "./tools";
import { ZhipuUsageMapper } from "./usage";

export function createZhipuMapper(): ProviderMapper<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> {
	const finishReason = new ZhipuFinishReasonMapper();
	return {
		request: new ChatRequestMapper<
			ChatCompletionTextRequest,
			TextMessage,
			ChatTool[],
			ToolChoice
		>({
			negotiator: new ZhipuCompatibilityNegotiator(),
			factory: new ZhipuRequestFactory(),
			messages: new ZhipuMessageMapper(),
			tools: new ZhipuToolIndexBuilder(),
			toolChoice: new ZhipuToolChoiceMapper(),
			options: new ZhipuRequestOptionsMapper(),
		}),
		response: new ChatResponseMapper({
			accessor: new ZhipuResponseAccessor(),
			finishReason,
			output: new ZhipuResponseOutputMapper(),
			usage: new ZhipuUsageMapper(),
			outputText: extractZhipuOutputText,
			emptyChoicesStatus: {
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
		}),
		stream: new ChatStreamMapper({
			delta: new ZhipuStreamDeltaMapper(),
			finishReason,
			toolCall: new ZhipuToolCallRestorer(),
			deferTerminal: true,
		}),
	};
}
