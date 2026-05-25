import { ChatProviderClient } from "../shared/chat-provider-client";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";
import { ZHIPU_PROVIDER_NAME } from "./provider";

export class ZhipuClient extends ChatProviderClient<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		super({ provider: ZHIPU_PROVIDER_NAME, baseURL, apiKey, timeout });
	}
}
