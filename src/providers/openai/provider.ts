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

export const OPENAI_PROVIDER_NAME = "openai";

export class OpenAIProvider
	implements
		Provider<ChatCompletionCreateRequest, ChatCompletion, ChatCompletionChunk>
{
	readonly name = OPENAI_PROVIDER_NAME;
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
