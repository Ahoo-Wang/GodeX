import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponseUsage } from "../../protocol/openai/responses";
import type { ProviderCapabilities } from "../compatibility";

export type ProviderSpecStreamDelta = unknown;

export interface ProviderRuntimeConfig {
	readonly spec: string;
	readonly credentials: { readonly api_key: string };
	readonly endpoint?: { readonly base_url?: string };
	readonly timeout_ms?: number;
}

export interface ProviderEndpointSpec {
	readonly defaultBaseURL: string;
}

export interface ProviderAuthSpec {
	readonly scheme: "bearer";
}

export interface ToolNameCodec {
	toProviderName(name: string): string;
	fromProviderName(name: string): string | undefined;
}

export interface ChatCompletionResponseAccessor<TResponse> {
	firstChoice(response: TResponse): unknown | undefined;
	finishReason(response: TResponse): string | undefined;
	outputText(response: TResponse): string;
	usage(response: TResponse): ResponseUsage | null;
}

export interface ChatCompletionStreamAccessor<TChunk> {
	deltas(chunk: TChunk): ProviderSpecStreamDelta[];
}

export interface ProviderHooks<TRequest, TResponse, TChunk> {
	patchRequest?(request: TRequest): TRequest;
	normalizeResponse?(response: TResponse): TResponse;
	normalizeChunk?(chunk: TChunk): TChunk;
}

export interface ProviderSpec<TRequest, TResponse, TChunk> {
	readonly name: string;
	readonly protocol: "chat_completions";
	readonly capabilities: ProviderCapabilities;
	readonly endpoint: ProviderEndpointSpec;
	readonly auth: ProviderAuthSpec;
	readonly toolName: ToolNameCodec;
	readonly response: ChatCompletionResponseAccessor<TResponse>;
	readonly stream: ChatCompletionStreamAccessor<TChunk>;
	readonly hooks?: ProviderHooks<TRequest, TResponse, TChunk>;
}

export interface ProviderEdge<TRequest, TResponse, TChunk> {
	readonly name: string;
	readonly spec: ProviderSpec<TRequest, TResponse, TChunk>;
	request(body: TRequest): Promise<TResponse>;
	stream(body: TRequest): Promise<ReadableStream<JsonServerSentEvent<TChunk>>>;
}
