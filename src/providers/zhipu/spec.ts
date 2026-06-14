import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	type ProviderSpec,
} from "../../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../../bridge/tools";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import {
	mapZhipuUsage,
	ZHIPU_SPEC_CAPABILITIES,
	zhipuFinishReason,
	zhipuFirstChoice,
	zhipuOutputText,
	zhipuPatchRequest,
	zhipuReasoningText,
	zhipuResponseUsage,
	zhipuStreamDeltas,
	zhipuWebSearchCalls,
} from "./hooks";
import type {
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
	ChatCompletionResponse,
} from "./protocol";

export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
export const ZHIPU_CODING_PLAN_BASE_URL =
	"https://open.bigmodel.cn/api/coding/paas/v4";
export const DEFAULT_ZHIPU_BASE_URL = ZHIPU_CODING_PLAN_BASE_URL;
export const ZHIPU_PROVIDER_NAME = "zhipu";
export const ZHIPU_DEFAULT_MODEL = "glm-5.2";

export const ZHIPU_PROVIDER_SPEC: ProviderSpec<
	BridgeChatCompletionCreateRequest,
	ChatCompletionResponse,
	ChatCompletionChunk,
	ChatCompletionCreateRequest
> = {
	name: ZHIPU_PROVIDER_NAME,
	protocol: CHAT_COMPLETIONS_PROTOCOL,
	capabilities: ZHIPU_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_ZHIPU_BASE_URL,
	},
	auth: BEARER_AUTH,
	toolName: DEFAULT_TOOL_NAME_CODEC,
	response: {
		firstChoice: zhipuFirstChoice,
		finishReason: zhipuFinishReason,
		outputText: zhipuOutputText,
		reasoningText: zhipuReasoningText,
		webSearchCalls: zhipuWebSearchCalls,
		usage: zhipuResponseUsage,
	},
	stream: {
		deltas: zhipuStreamDeltas,
	},
	hooks: {
		patchRequest: zhipuPatchRequest,
	},
};

export { mapZhipuUsage };
