import type { ProviderRuntimeConfig } from "../../bridge/provider-spec";
import { createProviderEdge } from "../../bridge/provider-spec";
import { ChatProviderClient } from "../shared/chat-provider-client";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "./protocol";
import { XIAOMI_PROVIDER_SPEC } from "./spec";

export function createXiaomiProviderEdge(config: ProviderRuntimeConfig) {
	const client = new ChatProviderClient<
		ChatCompletionRequest,
		ChatCompletion,
		ChatCompletionChunk
	>({
		provider: XIAOMI_PROVIDER_SPEC.name,
		baseURL:
			config.endpoint?.base_url ?? XIAOMI_PROVIDER_SPEC.endpoint.defaultBaseURL,
		apiKey: config.credentials.api_key,
		timeout: config.timeout_ms,
	});

	return createProviderEdge({
		spec: XIAOMI_PROVIDER_SPEC,
		config,
		request: client.request.bind(client),
		stream: client.stream.bind(client),
	});
}
