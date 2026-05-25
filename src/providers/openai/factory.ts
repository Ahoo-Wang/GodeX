import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../protocol/openai/completions";
import { DEFAULT_OPENAI_BASE_URL, OpenAIProvider } from "./provider";

export function createOpenAIProvider(
	config: ProviderConfig,
): Provider<ChatCompletionCreateRequest, ChatCompletion, ChatCompletionChunk> {
	return new OpenAIProvider(
		config.base_url ?? DEFAULT_OPENAI_BASE_URL,
		config.api_key,
	);
}
