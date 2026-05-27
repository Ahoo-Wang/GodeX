import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import { createProviderBundle } from "../provider-bundle";
import { createDeepSeekMapper } from "./mapper";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol/completions";
import { DEEPSEEK_PROVIDER_NAME, DEFAULT_DEEPSEEK_BASE_URL } from "./provider";
import { DeepSeekClient } from "./provider-client";

export function createDeepSeekProvider(
	config: ProviderConfig,
): Provider<ChatCompletionRequest, ChatCompletion, ChatCompletionChunk> {
	const mapper = createDeepSeekMapper();
	return createProviderBundle({
		name: DEEPSEEK_PROVIDER_NAME,
		mapper,
		client: new DeepSeekClient(
			config.base_url || DEFAULT_DEEPSEEK_BASE_URL,
			config.api_key,
		),
	});
}
