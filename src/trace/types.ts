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
	payload?: TracePayloadInput;
}

export interface TraceUsageSnapshot {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	cached_tokens?: number;
	cache_hit_ratio?: number | null;
}

export interface TraceUsageRecordEvent extends TraceRecordBase {
	kind: "usage";
	usage: TraceUsageSnapshot;
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
