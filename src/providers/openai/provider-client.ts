import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { ChatProviderClient } from "../shared/chat-provider-client";
import { OPENAI_PROVIDER_NAME } from "./provider";

export class OpenAIClient extends ChatProviderClient<
	ChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	constructor(baseURL: string, apiKey: string, timeout?: number) {
		super({ provider: OPENAI_PROVIDER_NAME, baseURL, apiKey, timeout });
	}
}
