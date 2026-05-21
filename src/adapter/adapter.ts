// src/adapter/adapter.ts
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";

export { ResponsesContext } from "../context/responses-context";
export { AdapterError, ProviderError } from "../error";
export type {
	RequestMapper,
	ResponseMapper,
	StreamMapper,
} from "./mapper/contract";
export type {
	StatusFields,
	StreamState,
	ToolCallAccumulator,
} from "./mapper/stream-state";
export { StreamPhase } from "./mapper/stream-state";
export type {
	Provider,
	ProviderCapabilities,
	ProviderMapper,
} from "./provider";
export { DEFAULT_CAPABILITIES } from "./provider";

export interface Adapter {
	request(ctx: ResponsesContext): Promise<ResponseObject>;
	stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}
