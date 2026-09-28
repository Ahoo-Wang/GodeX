import { describe, expect, test } from "bun:test";
import { parseTraceConfig } from "./trace";

describe("parseTraceConfig", () => {
	test("defaults trace config to enabled", () => {
		expect(parseTraceConfig(undefined)).toEqual({
			enabled: true,
			path: "./data/trace.db",
			max_queue_size: 10000,
			flush_interval_ms: 1000,
			batch_size: 100,
			capture_payload: false,
			payload_max_bytes: 65536,
		});
	});

	test("parses disabled trace config", () => {
		expect(parseTraceConfig({ enabled: false })).toMatchObject({
			enabled: false,
		});
	});

	test("parses enabled trace config", () => {
		expect(
			parseTraceConfig({
				enabled: true,
				path: "./tmp/trace.sqlite",
				max_queue_size: 10,
				flush_interval_ms: 25,
				batch_size: 5,
				capture_payload: true,
				payload_max_bytes: 128,
			}),
		).toEqual({
			enabled: true,
			path: "./tmp/trace.sqlite",
			max_queue_size: 10,
			flush_interval_ms: 25,
			batch_size: 5,
			capture_payload: true,
			payload_max_bytes: 128,
		});
	});

	test("rejects invalid numeric values", () => {
		expect(() => parseTraceConfig({ max_queue_size: 0 })).toThrow(
			"trace.max_queue_size must be a positive integer",
		);
	});

	test("trims trace path before storing it", () => {
		expect(parseTraceConfig({ path: " ./tmp/trace.sqlite " }).path).toBe(
			"./tmp/trace.sqlite",
		);
	});
});
