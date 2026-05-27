import type { Provider } from "../../adapter/provider";
import type { ProviderConfig } from "../../config";
import type { ProviderFactoryOptions } from "../factory-options";
import { createProviderBundle } from "../provider-bundle";
import { createZhipuMapper } from "./mapper";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";
import { DEFAULT_ZHIPU_BASE_URL, ZHIPU_PROVIDER_NAME } from "./provider";
import { ZhipuClient } from "./provider-client";

export function createZhipuProvider(
	config: ProviderConfig,
	options: ProviderFactoryOptions = {},
): Provider<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
> {
	const mapper = createZhipuMapper();
	return createProviderBundle({
		name: ZHIPU_PROVIDER_NAME,
		mapper,
		client: new ZhipuClient(
			config.base_url || DEFAULT_ZHIPU_BASE_URL,
			config.api_key,
			options.timeout,
		),
	});
}
