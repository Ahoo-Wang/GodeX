import { ChatProviderClient } from "../shared/chat-provider-client";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";

export class ZhipuClient extends ChatProviderClient<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		super({ provider: "zhipu", baseURL, apiKey, timeout });
	}
}
