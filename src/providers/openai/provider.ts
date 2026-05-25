import type { ProviderCapabilities } from "../../adapter/capabilities";
import { mergeCapabilities } from "../../adapter/capabilities";
import type { Provider } from "../../adapter/provider";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { OpenAIClient } from "./provider-client";
import { buildOpenAIRequest } from "./request";
import { buildResponseObject } from "./response";
import { OpenAIStreamMapper } from "./stream";

export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

const OPENAI_CAPABILITIES: ProviderCapabilities = mergeCapabilities({
	supportedToolTypes: new Set([
		"function",
		"custom",
		"web_search",
		"web_search_2025_08_26",
		"web_search_preview",
		"web_search_preview_2025_03_11",
		"local_shell",
		"shell",
		"apply_patch",
		"tool_search",
		"namespace",
	]),
	reasoning: true,
	structuredOutput: true,
	webSearch: true,
	parallelToolCalls: true,
	streamingToolCalls: true,
	features: new Set(["vision", "audio"]),
	maxTools: -1,
});

export const OPENAI_PROVIDER_NAME = "openai";

export class OpenAIProvider
	implements
		Provider<ChatCompletionCreateRequest, ChatCompletion, ChatCompletionChunk>
{
	readonly name = OPENAI_PROVIDER_NAME;
	readonly capabilities = OPENAI_CAPABILITIES;
	readonly mapper = {
		request: { map: buildOpenAIRequest },
		response: { map: buildResponseObject },
		stream: new OpenAIStreamMapper(),
	};
	readonly client: OpenAIClient;

	constructor(baseURL: string, apiKey: string, timeout?: number) {
		this.client = new OpenAIClient(baseURL, apiKey, timeout);
	}
}
