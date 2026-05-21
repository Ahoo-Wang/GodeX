import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";
import { ZhipuProvider } from "./provider";

export function createZhipuProvider(
	config: ProviderConfig,
): Provider<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> {
	return new ZhipuProvider(config.base_url, config.api_key);
}
