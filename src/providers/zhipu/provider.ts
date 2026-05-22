import type { ProviderCapabilities } from "../../adapter/capabilities";
import { mergeCapabilities } from "../../adapter/capabilities";
import type { Provider } from "../../adapter/provider";
import { ZhipuChatClient } from "./chat-client";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";
import { buildZhipuRequest } from "./request";
import { buildResponseObject } from "./response";
import { ZhipuStreamMapper } from "./stream";

/** Standard Zhipu API base URL. */
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export const ZHIPU_CODING_PLAN_BASE_URL =
	"https://open.bigmodel.cn/api/coding/paas/v4";

/** Default base URL (Coding Plan). */
export const DEFAULT_ZHIPU_BASE_URL = ZHIPU_CODING_PLAN_BASE_URL;

const ZHIPU_CAPABILITIES: ProviderCapabilities = mergeCapabilities({
	supportedToolTypes: new Set([
		"function",
		"web_search",
		"web_search_2025_08_26",
		"web_search_preview",
		"web_search_preview_2025_03_11",
		"file_search",
		"mcp",
		"local_shell",
		"shell",
		"apply_patch",
		"custom",
		"tool_search",
		"namespace",
	]),
	reasoning: true,
	structuredOutput: true,
	webSearch: true,
	fileSearch: true,
	parallelToolCalls: true,
	streamingToolCalls: true,
	features: new Set(["vision", "audio", "video"]),
	maxTools: 128,
});

export class ZhipuProvider
	implements
		Provider<
			ChatCompletionTextRequest,
			ChatCompletionResponse,
			ChatCompletionChunk
		>
{
	readonly name = "zhipu";
	readonly capabilities = ZHIPU_CAPABILITIES;
	readonly mapper = {
		request: { map: buildZhipuRequest },
		response: { map: buildResponseObject },
		stream: new ZhipuStreamMapper(),
	};
	readonly chatClient: ZhipuChatClient;

	constructor(baseURL: string, apiKey: string, timeout?: number) {
		this.chatClient = new ZhipuChatClient(baseURL, apiKey, timeout);
	}
}
