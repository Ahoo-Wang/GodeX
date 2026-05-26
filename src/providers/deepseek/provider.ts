import { OpenAIProvider } from "../openai/provider";
import { createDeepSeekMapper } from "./mapper";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol/completions";
import { DeepSeekClient } from "./provider-client";

export const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEEPSEEK_PROVIDER_NAME = "deepseek";

export class DeepSeekProvider extends OpenAIProvider<
	ChatCompletionRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		const mapper = createDeepSeekMapper();
		super({
			name: DEEPSEEK_PROVIDER_NAME,
			client: new DeepSeekClient(baseURL, apiKey, timeout),
			request: mapper.request,
			response: mapper.response,
			stream: mapper.stream,
		});
	}
}
