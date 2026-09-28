import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ProviderRuntimeConfig } from "../../bridge/provider-spec";
import { createProviderEdge } from "../../bridge/provider-spec";
import type {
	ExampleChatChunk,
	ExampleChatRequest,
	ExampleChatResponse,
} from "./spec";
import { EXAMPLE_PROVIDER_SPEC } from "./spec";

export function createExampleProviderEdge(
	config: ProviderRuntimeConfig,
	transport?: {
		request?(body: ExampleChatRequest): Promise<ExampleChatResponse>;
		stream?(
			body: ExampleChatRequest,
		): Promise<ReadableStream<JsonServerSentEvent<ExampleChatChunk>>>;
	},
) {
	return createProviderEdge({
		spec: EXAMPLE_PROVIDER_SPEC,
		config,
		request: transport?.request,
		stream: transport?.stream,
	});
}
