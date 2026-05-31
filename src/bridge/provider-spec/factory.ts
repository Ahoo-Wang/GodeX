import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import type {
	ProviderEdge,
	ProviderRuntimeConfig,
	ProviderSpec,
} from "./contract";

export type ProviderRequestImplementation<TRequest, TResponse> = (
	body: TRequest,
) => Promise<TResponse>;

export type ProviderStreamImplementation<TRequest, TChunk> = (
	body: TRequest,
) => Promise<ReadableStream<JsonServerSentEvent<TChunk>>>;

export interface CreateProviderEdgeOptions<
	TBridgeRequest,
	TResponse,
	TChunk,
	TProviderRequest = TBridgeRequest,
> {
	readonly spec: ProviderSpec<
		TBridgeRequest,
		TResponse,
		TChunk,
		TProviderRequest
	>;
	readonly config: ProviderRuntimeConfig;
	readonly request?: ProviderRequestImplementation<TProviderRequest, TResponse>;
	readonly stream?: ProviderStreamImplementation<TProviderRequest, TChunk>;
}

export function createProviderEdge<
	TBridgeRequest,
	TResponse,
	TChunk,
	TProviderRequest = TBridgeRequest,
>(
	input: CreateProviderEdgeOptions<
		TBridgeRequest,
		TResponse,
		TChunk,
		TProviderRequest
	>,
): ProviderEdge<TBridgeRequest, TResponse, TChunk, TProviderRequest> {
	const { spec } = input;
	const endpointBaseURL =
		input.config.endpoint?.base_url ?? spec.endpoint.defaultBaseURL;
	return {
		name: spec.name,
		spec,
		request: async (body, options) => {
			const patched =
				spec.hooks?.patchRequest?.(body) ??
				(body as unknown as TProviderRequest);
			options?.onPatchedRequest?.(patched);
			if (!input.request) {
				throw notConfiguredError({
					provider: spec.name,
					body: patched,
					operation: "request",
					specRef: input.config.spec,
					endpointBaseURL,
				});
			}
			options?.onRequestPrepared?.(patched);
			const response = await input.request(patched);
			return spec.hooks?.normalizeResponse?.(response) ?? response;
		},
		stream: async (body, options) => {
			const patched =
				spec.hooks?.patchRequest?.(body) ??
				(body as unknown as TProviderRequest);
			options?.onPatchedRequest?.(patched);
			if (!input.stream) {
				throw notConfiguredError({
					provider: spec.name,
					body: patched,
					operation: "stream",
					specRef: input.config.spec,
					endpointBaseURL,
				});
			}
			options?.onRequestPrepared?.(patched);
			return normalizeChunkStream(
				await input.stream(patched),
				spec.hooks?.normalizeChunk,
			);
		},
	};
}

function normalizeChunkStream<TChunk>(
	stream: ReadableStream<JsonServerSentEvent<TChunk>>,
	normalizeChunk: ((chunk: TChunk) => TChunk) | undefined,
): ReadableStream<JsonServerSentEvent<TChunk>> {
	if (!normalizeChunk) return stream;
	return stream.pipeThrough(
		new TransformStream<
			JsonServerSentEvent<TChunk>,
			JsonServerSentEvent<TChunk>
		>({
			transform(event, controller) {
				controller.enqueue({
					...event,
					data: normalizeChunk(event.data),
				});
			},
		}),
	);
}

function notConfiguredError(input: {
	readonly provider: string;
	readonly body: unknown;
	readonly operation: "request" | "stream";
	readonly specRef: string;
	readonly endpointBaseURL: string;
}): ProviderError {
	return new ProviderError(
		PROVIDER_UPSTREAM_ERROR,
		`Provider ${input.provider} ${input.operation} client is not configured.`,
		{
			provider: input.provider,
			model: modelOf(input.body),
			upstreamStatus: 0,
			operation: input.operation,
			spec: input.specRef,
			endpointBaseURL: input.endpointBaseURL,
		},
	);
}

function modelOf(body: unknown): string {
	if (
		typeof body === "object" &&
		body !== null &&
		"model" in body &&
		typeof body.model === "string"
	) {
		return body.model;
	}
	return "unknown";
}
