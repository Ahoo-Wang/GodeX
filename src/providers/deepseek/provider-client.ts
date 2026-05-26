import { ChatProviderClient } from "../shared/chat-provider-client";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol/completions";
import { DEEPSEEK_PROVIDER_NAME } from "./provider";

export class DeepSeekClient extends ChatProviderClient<
	ChatCompletionRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		super({ provider: DEEPSEEK_PROVIDER_NAME, baseURL, apiKey, timeout });
	}
}
