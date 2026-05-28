import type { ProviderSpec } from "../../bridge/provider-spec";
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

export const DEEPSEEK_PROVIDER_SPEC: ProviderSpec<
	ChatCompletionRequest,
	ChatCompletion,
	ChatCompletionChunk
> = {
	name: DEEPSEEK_PROVIDER_NAME,
	protocol: "chat_completions",
	capabilities: DEEPSEEK_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_DEEPSEEK_BASE_URL,
		chatCompletionsPath: "/chat/completions",
	},
	auth: { scheme: "bearer" },
	toolName: {
		toProviderName: toDeepSeekFunctionName,
		fromProviderName: (name) => name,
	},
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

function toDeepSeekFunctionName(name: string): string {
	const normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
	return normalized.length > 0 ? normalized : "tool";
}
