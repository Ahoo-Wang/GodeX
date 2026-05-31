import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type {
	ResponseItem,
	ResponseUsage,
} from "../../protocol/openai/responses";
import type { ProviderCapabilities } from "../compatibility";

export type ProviderSpecStreamDelta = unknown;
export const CHAT_COMPLETIONS_PROTOCOL = "chat_completions" as const;
export type ProviderProtocol = typeof CHAT_COMPLETIONS_PROTOCOL;
export const BEARER_AUTH_SCHEME = "bearer" as const;

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
	readonly scheme: typeof BEARER_AUTH_SCHEME;
}

export const BEARER_AUTH: ProviderAuthSpec = { scheme: BEARER_AUTH_SCHEME };

export interface ToolNameCodec {
	toProviderName(name: string): string;
	fromProviderName(name: string): string | undefined;
}

export interface ChatCompletionResponseAccessor<TResponse> {
	firstChoice(response: TResponse): unknown | undefined;
	finishReason(response: TResponse): string | undefined;
	outputText(response: TResponse): string;
	reasoningText?(response: TResponse): string | undefined;
	webSearchCalls?(response: TResponse): ResponseItem[];
	usage(response: TResponse): ResponseUsage | null;
}

export interface ChatCompletionStreamAccessor<TChunk> {
	deltas(chunk: TChunk): ProviderSpecStreamDelta[];
}

export interface ProviderHooks<
	TBridgeRequest,
	TResponse,
	TChunk,
	TProviderRequest = TBridgeRequest,
> {
	patchRequest?(request: TBridgeRequest): TProviderRequest;
	normalizeResponse?(response: TResponse): TResponse;
	normalizeChunk?(chunk: TChunk): TChunk;
}

export interface ProviderRequestOptions<TProviderRequest = unknown> {
	onPatchedRequest?(body: TProviderRequest): void;
	onRequestPrepared?(body: TProviderRequest): void;
}

export interface ProviderSpec<
	TBridgeRequest,
	TResponse,
	TChunk,
	TProviderRequest = TBridgeRequest,
> {
	readonly name: string;
	readonly protocol: ProviderProtocol;
	readonly capabilities: ProviderCapabilities;
	readonly endpoint: ProviderEndpointSpec;
	readonly auth: ProviderAuthSpec;
	readonly toolName: ToolNameCodec;
	readonly response: ChatCompletionResponseAccessor<TResponse>;
	readonly stream: ChatCompletionStreamAccessor<TChunk>;
	readonly hooks?: ProviderHooks<
		TBridgeRequest,
		TResponse,
		TChunk,
		TProviderRequest
	>;
}

export interface ProviderEdge<
	TBridgeRequest,
	TResponse,
	TChunk,
	TProviderRequest = TBridgeRequest,
> {
	readonly name: string;
	readonly spec: ProviderSpec<
		TBridgeRequest,
		TResponse,
		TChunk,
		TProviderRequest
	>;
	request(
		body: TBridgeRequest,
		options?: ProviderRequestOptions<TProviderRequest>,
	): Promise<TResponse>;
	stream(
		body: TBridgeRequest,
		options?: ProviderRequestOptions<TProviderRequest>,
	): Promise<ReadableStream<JsonServerSentEvent<TChunk>>>;
}
