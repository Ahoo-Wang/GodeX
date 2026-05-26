import type { ResponseCreateRequest } from "../protocol/openai";

export interface TracePayloadOptions {
	capturePayload: boolean;
	payloadMaxBytes: number;
}

export interface TracePayloadSummary {
	payload_hash: string;
	payload_bytes: number;
	payload_json: string | null;
	payload_truncated: boolean;
}

export interface TracePayloadInput {
	payload?: unknown;
	payload_hash?: string;
	payload_bytes?: number;
}

export interface TraceRecordBase {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	created_at: number;
}

export interface TraceRequestRecordEvent extends TraceRecordBase {
	kind: "request";
	stream: boolean;
	requested_prompt_cache_key?: string;
	requested_prompt_cache_retention?: string;
	prompt_cache_key?: string;
	prompt_cache_retention?: string;
	cache_detection?: PromptCacheDetection;
	payload?: TracePayloadInput;
}

export interface TraceUsageSnapshot {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	cached_tokens?: number;
	cache_hit_ratio?: number | null;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

export interface TraceUsageRecordEvent extends TraceRecordBase {
	kind: "usage";
	usage: TraceUsageSnapshot;
	raw_usage?: unknown;
}

export interface TraceEventRecordEvent extends TraceRecordBase {
	kind: "event";
	event_name:
		| "provider.request.body"
		| "provider.response.body"
		| "upstream.stream.event.raw"
		| "upstream.stream.event.transformed";
	sequence?: number;
	payload?: TracePayloadInput;
}

export type TraceRecordEvent =
	| TraceRequestRecordEvent
	| TraceUsageRecordEvent
	| TraceEventRecordEvent;

export interface ProviderPromptCacheRequestAnalyzer<
	TProviderRequest = unknown,
> {
	analyze(input: {
		provider: string;
		model: string;
		request: ResponseCreateRequest;
		providerRequest: TProviderRequest;
	}): PromptCacheAnalysisInput;
}

export interface PromptCacheAnalysisInput {
	provider: string;
	model: string;
	requested_prompt_cache_key?: string;
	requested_prompt_cache_retention?: string;
	prompt_cache_key?: string;
	prompt_cache_retention?: string;
	has_cache_control?: boolean;
	prefix_parts: Array<{
		kind: "instruction" | "system" | "developer" | "message" | "tool";
		role?: string;
		name?: string;
		bytes: number;
		hash: string;
	}>;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	static_prefix_hash: string;
	static_prefix_bytes: number;
	dynamic_text_candidates: Array<{
		source: "instructions" | "message";
		role?: string;
		text: string;
	}>;
}

export interface PromptCacheObservation {
	provider: string;
	model: string;
	cache_identity_key: string;
	prefix_hash: string;
	prefix_bytes: number;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	created_at: number;
	request_id: string;
}

export interface PromptCacheObservationIndex {
	get(input: {
		provider: string;
		model: string;
		cache_identity_key?: string;
	}): PromptCacheObservation | null;
	remember(observation: PromptCacheObservation): void;
}

export interface PromptCacheDetector {
	detect(input: {
		current: PromptCacheAnalysisInput;
		previous?: PromptCacheObservation | null;
	}): PromptCacheDetection;
}

export interface PromptCacheDetection {
	risk_level: "none" | "low" | "medium" | "high";
	reasons: string[];
	prefix_hash: string;
	prefix_bytes: number;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	passthrough: {
		prompt_cache_key: boolean;
		prompt_cache_retention: boolean;
		cache_control: boolean;
	};
}
