import { ChatRequestMapper } from "../../../adapter/mapper/chat/request-mapper";
import { ChatResponseMapper } from "../../../adapter/mapper/chat/response-mapper";
import { ChatStreamMapper } from "../../../adapter/mapper/chat/stream-mapper";
import type { ProviderMapper } from "../../../adapter/provider";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
	ChatCompletionMessageParam,
	ChatCompletionTool,
	ChatCompletionToolChoiceOption,
} from "../../../protocol/openai/completions";
import { extractResponseOutputText as extractOpenAIOutputText } from "../../shared/response-message-payloads";
import { OpenAICompatibilityNegotiator } from "./compatibility";
import { OpenAIFinishReasonMapper } from "./finish-reason";
import { OpenAIMessageMapper } from "./messages";
import {
	OpenAIRequestFactory,
	OpenAIRequestOptionsMapper,
} from "./request-options";
import {
	OpenAIResponseAccessor,
	OpenAIResponseOutputMapper,
} from "./response-output";
import { OpenAIStreamDeltaMapper } from "./stream-delta";
import {
	OpenAIToolCallIdentityResolver,
	OpenAIToolCallMapper,
} from "./tool-calls";
import { OpenAIToolChoiceMapper, OpenAIToolMapper } from "./tools";
import { OpenAIUsageMapper } from "./usage";

export function createOpenAIMapper(): ProviderMapper<
	ChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	const finishReason = new OpenAIFinishReasonMapper();
	return {
		request: new ChatRequestMapper<
			ChatCompletionCreateRequest,
			ChatCompletionMessageParam,
			ChatCompletionTool[],
			ChatCompletionToolChoiceOption
		>({
			negotiator: new OpenAICompatibilityNegotiator(),
			factory: new OpenAIRequestFactory(),
			messages: new OpenAIMessageMapper(),
			tools: new OpenAIToolMapper(),
			toolChoice: new OpenAIToolChoiceMapper(),
			options: new OpenAIRequestOptionsMapper(),
		}),
		response: new ChatResponseMapper({
			accessor: new OpenAIResponseAccessor(),
			finishReason,
			output: new OpenAIResponseOutputMapper(),
			usage: new OpenAIUsageMapper(),
			outputText: extractOpenAIOutputText,
			emptyChoicesStatus: {
				status: "failed",
				error: { code: "server_error", message: "Empty choices from upstream" },
			},
		}),
		stream: new ChatStreamMapper({
			delta: new OpenAIStreamDeltaMapper(),
			finishReason,
			identity: new OpenAIToolCallIdentityResolver(),
			toolCall: new OpenAIToolCallMapper(),
			deferTerminal: true,
		}),
	};
}
