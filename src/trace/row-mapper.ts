import { summarizePayload } from "./payload";
import type { TraceStoreRow } from "./sqlite";
import type { TracePayloadOptions, TraceRecordEvent } from "./types";

export interface TraceRowMapperLogger {
	warn(
		event: string,
		attr?: Record<string, unknown> | (() => Record<string, unknown>),
	): void;
}

export interface TraceRecordRowMapperOptions extends TracePayloadOptions {
	logger: TraceRowMapperLogger;
}

export function mapTraceRecordToRow(
	event: TraceRecordEvent,
	options: TraceRecordRowMapperOptions,
): TraceStoreRow | null {
	try {
		if (event.kind === "request") {
			const payload = payloadSummary(
				event.payload?.payload,
				event.request_id,
				options,
			);
			return {
				table: "requests",
				request_id: event.request_id,
				response_id: event.response_id,
				provider: event.provider,
				model: event.model,
				stream: event.stream,
				created_at: event.created_at,
				requested_prompt_cache_key: event.requested_prompt_cache_key ?? null,
				requested_prompt_cache_retention:
					event.requested_prompt_cache_retention ?? null,
				prompt_cache_key: event.prompt_cache_key ?? null,
				prompt_cache_retention: event.prompt_cache_retention ?? null,
				prefix_hash: event.cache_detection?.prefix_hash ?? null,
				prefix_bytes: event.cache_detection?.prefix_bytes ?? null,
				cache_risk_level: event.cache_detection?.risk_level ?? null,
				cache_risk_reasons_json: event.cache_detection
					? JSON.stringify(event.cache_detection.reasons)
					: null,
				tool_fingerprint_json: event.cache_detection?.tool_fingerprint
					? JSON.stringify(event.cache_detection.tool_fingerprint)
					: null,
				passthrough_json: event.cache_detection
					? JSON.stringify(event.cache_detection.passthrough)
					: null,
				...payload,
			};
		}
		if (event.kind === "usage") {
			return {
				table: "usage",
				request_id: event.request_id,
				response_id: event.response_id,
				provider: event.provider,
				model: event.model,
				created_at: event.created_at,
				input_tokens: event.usage.input_tokens ?? null,
				output_tokens: event.usage.output_tokens ?? null,
				total_tokens: event.usage.total_tokens ?? null,
				cached_tokens: event.usage.cached_tokens ?? null,
				cache_hit_ratio: event.usage.cache_hit_ratio ?? null,
				cache_creation_input_tokens:
					event.usage.cache_creation_input_tokens ?? null,
				cache_read_input_tokens: event.usage.cache_read_input_tokens ?? null,
				raw_usage_json:
					event.raw_usage === undefined
						? null
						: JSON.stringify(event.raw_usage),
			};
		}
		const payload = payloadSummary(
			event.payload?.payload,
			event.request_id,
			options,
		);
		return {
			table: "events",
			request_id: event.request_id,
			response_id: event.response_id,
			event_name: event.event_name,
			sequence: event.sequence ?? 0,
			created_at: event.created_at,
			...payload,
		};
	} catch (err) {
		warn(options.logger, "trace.serialize.error", {
			request_id: event.request_id,
			error: String(err),
		});
		return null;
	}
}

function payloadSummary(
	payload: unknown,
	requestId: string,
	options: TraceRecordRowMapperOptions,
) {
	if (payload === undefined) return emptyPayload();
	try {
		return summarizePayload(payload, {
			capturePayload: options.capturePayload,
			payloadMaxBytes: options.payloadMaxBytes,
		});
	} catch (err) {
		warn(options.logger, "trace.payload.serialize.error", {
			request_id: requestId,
			error: String(err),
		});
		return emptyPayload();
	}
}

function emptyPayload() {
	return {
		payload_hash: null,
		payload_bytes: null,
		payload_json: null,
		payload_truncated: false,
	};
}

function warn(
	logger: TraceRowMapperLogger,
	event: string,
	attr: Record<string, unknown>,
): void {
	try {
		logger.warn(event, attr);
	} catch {
		return;
	}
}
