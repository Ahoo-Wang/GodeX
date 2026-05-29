import type { ProviderRuntimeConfig } from "../../bridge/provider-spec";
import { createProviderEdge } from "../../bridge/provider-spec";
import { ChatProviderClient } from "../shared/chat-provider-client";
import type {
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
	ChatCompletionResponse,
} from "./protocol";
import { ZHIPU_PROVIDER_SPEC } from "./spec";

export function createZhipuProviderEdge(config: ProviderRuntimeConfig) {
	const client = new ChatProviderClient<
		ChatCompletionCreateRequest,
		ChatCompletionResponse,
		ChatCompletionChunk
	>({
		provider: ZHIPU_PROVIDER_SPEC.name,
		baseURL:
			config.endpoint?.base_url ?? ZHIPU_PROVIDER_SPEC.endpoint.defaultBaseURL,
		apiKey: config.credentials.api_key,
		timeout: config.timeout_ms,
	});

	return createProviderEdge({
		spec: ZHIPU_PROVIDER_SPEC,
		config,
		request: client.request.bind(client),
		stream: client.stream.bind(client),
	});
}
