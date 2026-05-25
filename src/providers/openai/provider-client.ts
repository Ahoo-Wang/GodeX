import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { ChatProviderClient } from "../shared/chat-provider-client";

export class OpenAIClient extends ChatProviderClient<
	ChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		super({ provider: "openai", baseURL, apiKey, timeout });
	}
}
