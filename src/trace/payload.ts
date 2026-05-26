import type { TracePayloadOptions, TracePayloadSummary } from "./types";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function sha256Hex(value: string): string {
	return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

export function summarizePayload(
	payload: unknown,
	options: TracePayloadOptions,
): TracePayloadSummary {
	let json: string;
	try {
		json = JSON.stringify(payload);
	} catch (err) {
		throw new Error("Failed to serialize trace payload", {
			cause: err instanceof Error ? err : undefined,
		});
	}
	if (json === undefined) json = "undefined";
	const bytes = encoder.encode(json);
	const truncated = bytes.byteLength > options.payloadMaxBytes;
	return {
		payload_hash: sha256Hex(json),
		payload_bytes: bytes.byteLength,
		payload_json: options.capturePayload
			? decoder.decode(
					truncated ? bytes.slice(0, options.payloadMaxBytes) : bytes,
				)
			: null,
		payload_truncated: options.capturePayload ? truncated : false,
	};
}
