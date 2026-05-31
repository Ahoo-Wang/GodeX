import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	type ProviderSpec,
} from "../../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../../bridge/tools";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import {
	mapXiaomiUsage,
	XIAOMI_SPEC_CAPABILITIES,
	xiaomiFinishReason,
	xiaomiFirstChoice,
	xiaomiOutputText,
	xiaomiPatchRequest,
	xiaomiReasoningText,
	xiaomiResponseUsage,
	xiaomiStreamDeltas,
	xiaomiWebSearchCalls,
} from "./hooks";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol";

export const DEFAULT_XIAOMI_BASE_URL = "https://api.xiaomimimo.com/v1";
export const XIAOMI_PROVIDER_NAME = "xiaomi";
export const XIAOMI_DEFAULT_MODEL = "mimo-v2.5-pro";

export const XIAOMI_PROVIDER_SPEC: ProviderSpec<
	BridgeChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest
> = {
	name: XIAOMI_PROVIDER_NAME,
	protocol: CHAT_COMPLETIONS_PROTOCOL,
	capabilities: XIAOMI_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_XIAOMI_BASE_URL,
	},
	auth: BEARER_AUTH,
	toolName: DEFAULT_TOOL_NAME_CODEC,
	response: {
		firstChoice: xiaomiFirstChoice,
		finishReason: xiaomiFinishReason,
		outputText: xiaomiOutputText,
		reasoningText: xiaomiReasoningText,
		webSearchCalls: xiaomiWebSearchCalls,
		usage: xiaomiResponseUsage,
	},
	stream: {
		deltas: xiaomiStreamDeltas,
	},
	hooks: {
		patchRequest: xiaomiPatchRequest,
	},
};

export { mapXiaomiUsage };
