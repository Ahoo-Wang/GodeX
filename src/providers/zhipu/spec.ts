import type { ProviderSpec } from "../../bridge/provider-spec";
import {
	mapZhipuUsage,
	ZHIPU_SPEC_CAPABILITIES,
	zhipuFinishReason,
	zhipuFirstChoice,
	zhipuOutputText,
	zhipuResponseUsage,
	zhipuStreamDeltas,
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

export const ZHIPU_PROVIDER_SPEC: ProviderSpec<
	ChatCompletionCreateRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> = {
	name: ZHIPU_PROVIDER_NAME,
	protocol: "chat_completions",
	capabilities: ZHIPU_SPEC_CAPABILITIES,
	endpoint: {
		defaultBaseURL: DEFAULT_ZHIPU_BASE_URL,
		chatCompletionsPath: "/chat/completions",
	},
	auth: { scheme: "bearer" },
	toolName: {
		toProviderName: toZhipuFunctionName,
		fromProviderName: (name) => name,
	},
	response: {
		firstChoice: zhipuFirstChoice,
		finishReason: zhipuFinishReason,
		outputText: zhipuOutputText,
		usage: zhipuResponseUsage,
	},
	stream: {
		deltas: zhipuStreamDeltas,
	},
};

export { mapZhipuUsage };

function toZhipuFunctionName(name: string): string {
	const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
	return sanitized || "codex_tool";
}
