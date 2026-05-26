import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol/completions";
import { DEFAULT_DEEPSEEK_BASE_URL, DeepSeekProvider } from "./provider";

export function createDeepSeekProvider(
	config: ProviderConfig,
): Provider<ChatCompletionRequest, ChatCompletion, ChatCompletionChunk> {
	return new DeepSeekProvider(
		config.base_url || DEFAULT_DEEPSEEK_BASE_URL,
		config.api_key,
	);
}
