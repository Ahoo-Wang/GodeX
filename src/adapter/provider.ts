// src/adapter/provider.ts
// Provider interface — the contract that every LLM backend must satisfy.

import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type {
	RequestMapper,
	ResponseMapper,
	StreamMapper,
} from "./mapper/contract";

export interface ProviderClient<TReq, TRes, TChunk> {
	request(body: TReq): Promise<TRes>;
	stream(body: TReq): Promise<ReadableStream<JsonServerSentEvent<TChunk>>>;
}

export interface ProviderMapper<TReq, TRes, TChunk> {
	readonly request: RequestMapper<TReq>;
	readonly response: ResponseMapper<TRes>;
	readonly stream: StreamMapper<TChunk>;
}

export interface Provider<TReq, TRes, TChunk> {
	readonly name: string;
	readonly mapper: ProviderMapper<TReq, TRes, TChunk>;
	readonly client: ProviderClient<TReq, TRes, TChunk>;
}
