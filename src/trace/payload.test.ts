import { describe, expect, test } from "bun:test";
import { summarizePayload } from "./payload";

describe("summarizePayload", () => {
	test("stores only hash and bytes when payload capture is disabled", () => {
		const summary = summarizePayload(
			{ a: 1 },
			{ capturePayload: false, payloadMaxBytes: 1024 },
		);
		expect(summary.payload_json).toBeNull();
		expect(summary.payload_bytes).toBeGreaterThan(0);
		expect(summary.payload_hash).toHaveLength(64);
		expect(summary.payload_truncated).toBe(false);
	});

	test("stores payload JSON when capture is enabled", () => {
		const summary = summarizePayload(
			{ a: 1 },
			{ capturePayload: true, payloadMaxBytes: 1024 },
		);
		expect(summary.payload_json).toBe('{"a":1}');
		expect(summary.payload_truncated).toBe(false);
	});

	test("truncates captured payload JSON over the configured byte limit", () => {
		const summary = summarizePayload(
			{ value: "abcdef" },
			{ capturePayload: true, payloadMaxBytes: 8 },
		);
		expect(summary.payload_json).toBe('{"value"');
		expect(summary.payload_truncated).toBe(true);
		expect(summary.payload_bytes).toBeGreaterThan(8);
	});

	test("throws a clear error for non-serializable payloads", () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() =>
			summarizePayload(circular, {
				capturePayload: false,
				payloadMaxBytes: 1024,
			}),
		).toThrow("Failed to serialize trace payload");
	});
});
