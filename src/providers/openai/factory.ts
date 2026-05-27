import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import type { ProviderFactoryOptions } from "../factory-options";
import { createProviderBundle } from "../provider-bundle";
import { createOpenAIMapper } from "./mapper";
import { DEFAULT_OPENAI_BASE_URL, OPENAI_PROVIDER_NAME } from "./provider";
import { OpenAIClient } from "./provider-client";

export function createOpenAIProvider(
	config: ProviderConfig,
	options: ProviderFactoryOptions = {},
): Provider<ChatCompletionCreateRequest, ChatCompletion, ChatCompletionChunk> {
	const mapper = createOpenAIMapper();
	return createProviderBundle({
		name: OPENAI_PROVIDER_NAME,
		mapper,
		client: new OpenAIClient(
			config.base_url || DEFAULT_OPENAI_BASE_URL,
			config.api_key,
			options.timeout,
		),
	});
}
