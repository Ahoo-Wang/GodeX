import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	type ProviderSpec,
} from "../../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../../bridge/tools";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import {
	MINIMAX_SPEC_CAPABILITIES,
	mapMiniMaxUsage,
	minimaxFinishReason,
	minimaxFirstChoice,
	minimaxOutputText,
	minimaxPatchRequest,
	minimaxReasoningText,
	minimaxResponseUsage,
	minimaxStreamDeltas,
} from "./hooks";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol";

export const DEFAULT_MINIMAX_BASE_URL = "https://api.minimaxi.com/v1";
export const MINIMAX_PROVIDER_NAME = "minimax";
export const MINIMAX_DEFAULT_MODEL = "MiniMax-M3";

export const MINIMAX_PROVIDER_SPEC: ProviderSpec<
	BridgeChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest
> = {
	name: MINIMAX_PROVIDER_NAME,
	protocol: CHAT_COMPLETIONS_PROTOCOL,
	capabilities: MINIMAX_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_MINIMAX_BASE_URL,
	},
	auth: BEARER_AUTH,
	toolName: DEFAULT_TOOL_NAME_CODEC,
	response: {
		firstChoice: minimaxFirstChoice,
		finishReason: minimaxFinishReason,
		outputText: minimaxOutputText,
		reasoningText: minimaxReasoningText,
		usage: minimaxResponseUsage,
	},
	stream: {
		deltas: minimaxStreamDeltas,
	},
	hooks: {
		patchRequest: minimaxPatchRequest,
	},
};

export { mapMiniMaxUsage };
