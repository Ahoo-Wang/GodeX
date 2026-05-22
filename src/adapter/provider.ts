// src/adapter/provider.ts
// Provider interface — the contract that every LLM backend must satisfy.

import type { ProviderCapabilities } from "./capabilities";
import type { ChatClient } from "./chatClient";
import type {
	RequestMapper,
	ResponseMapper,
	StreamMapper,
} from "./mapper/contract";

export interface ProviderMapper<TReq, TRes, TChunk> {
	readonly request: RequestMapper<TReq>;
	readonly response: ResponseMapper<TRes>;
	readonly stream: StreamMapper<TChunk>;
}

export interface Provider<TReq, TRes, TChunk> {
	readonly name: string;
	readonly mapper: ProviderMapper<TReq, TRes, TChunk>;
	readonly chatClient: ChatClient<TReq, TRes, TChunk>;
	readonly capabilities: ProviderCapabilities;
}
