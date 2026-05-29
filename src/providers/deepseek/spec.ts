import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	type ProviderSpec,
} from "../../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../../bridge/tools";
import type { ChatCompletionCreateRequest as BridgeChatCompletionCreateRequest } from "../../protocol/openai/completions";
import {
	DEEPSEEK_SPEC_CAPABILITIES,
	deepSeekFinishReason,
	deepSeekFirstChoice,
	deepSeekOutputText,
	deepSeekPatchRequest,
	deepSeekResponseUsage,
	deepSeekStreamDeltas,
	mapDeepSeekSpecUsage,
} from "./hooks";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_PROVIDER_NAME = "deepseek";
export const DEEPSEEK_DEFAULT_MODEL = "deepseek-v4-pro";

export const DEEPSEEK_PROVIDER_SPEC: ProviderSpec<
	BridgeChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest
> = {
	name: DEEPSEEK_PROVIDER_NAME,
	protocol: CHAT_COMPLETIONS_PROTOCOL,
	capabilities: DEEPSEEK_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_DEEPSEEK_BASE_URL,
	},
	auth: BEARER_AUTH,
	toolName: DEFAULT_TOOL_NAME_CODEC,
	response: {
		firstChoice: deepSeekFirstChoice,
		finishReason: deepSeekFinishReason,
		outputText: deepSeekOutputText,
		usage: deepSeekResponseUsage,
	},
	stream: {
		deltas: deepSeekStreamDeltas,
	},
	hooks: {
		patchRequest: deepSeekPatchRequest,
	},
};

export { mapDeepSeekSpecUsage };
