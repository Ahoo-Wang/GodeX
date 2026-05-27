import { resolveDefaultTracePath } from "../paths";
import { asConfigObject } from "../raw";
import type { TraceConfig } from "../schema";
import { positiveInteger } from "../validation";

export function parseTraceConfig(raw: unknown): TraceConfig {
	if (typeof raw !== "object" || raw === null) {
		return defaultTraceConfig();
	}

	const trace = asConfigObject(raw);
	const enabled = trace.enabled === true;
	return {
		enabled,
		path:
			typeof trace.path === "string" && trace.path.trim() !== ""
				? trace.path.trim()
				: resolveDefaultTracePath(),
		max_queue_size:
			trace.max_queue_size !== undefined
				? positiveInteger(trace.max_queue_size, "trace.max_queue_size")
				: 10000,
		flush_interval_ms:
			trace.flush_interval_ms !== undefined
				? positiveInteger(trace.flush_interval_ms, "trace.flush_interval_ms")
				: 1000,
		batch_size:
			trace.batch_size !== undefined
				? positiveInteger(trace.batch_size, "trace.batch_size")
				: 100,
		capture_payload: trace.capture_payload === true,
		payload_max_bytes:
			trace.payload_max_bytes !== undefined
				? positiveInteger(trace.payload_max_bytes, "trace.payload_max_bytes")
				: 65536,
	};
}

function defaultTraceConfig(): TraceConfig {
	return {
		enabled: false,
		path: resolveDefaultTracePath(),
		max_queue_size: 10000,
		flush_interval_ms: 1000,
		batch_size: 100,
		capture_payload: false,
		payload_max_bytes: 65536,
	};
}
