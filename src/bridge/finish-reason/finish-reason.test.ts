import { describe, expect, test } from "bun:test";
import { SERVER_ERROR } from "../../error";
import { mapProviderFinishReason } from "./finish-reason";

describe("mapProviderFinishReason", () => {
	test.each([
		["stop"],
		["tool_calls"],
	] as const)("maps %s to completed", (finishReason) => {
		expect(mapProviderFinishReason("acme", finishReason)).toEqual({
			status: "completed",
			error: null,
			incomplete_details: null,
		});
	});

	test("maps provider token limits and content filters to incomplete", () => {
		expect(mapProviderFinishReason("acme", "length")).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "max_output_tokens" },
		});
		expect(mapProviderFinishReason("acme", "sensitive")).toMatchObject({
			status: "incomplete",
			incomplete_details: { reason: "content_filter" },
		});
	});

	test("maps network_error finish reason to a known provider failure", () => {
		expect(mapProviderFinishReason("zhipu", "network_error")).toEqual({
			status: "failed",
			error: {
				code: SERVER_ERROR,
				message: "Provider zhipu reported network_error finish reason.",
			},
			incomplete_details: null,
		});
	});

	test("maps missing and unknown finish reasons to failed", () => {
		expect(mapProviderFinishReason("acme", null)).toEqual({
			status: "failed",
			error: {
				code: SERVER_ERROR,
				message: "Provider acme returned no finish reason.",
			},
			incomplete_details: null,
		});
		expect(mapProviderFinishReason("acme", "unknown_reason")).toEqual({
			status: "failed",
			error: {
				code: SERVER_ERROR,
				message:
					"Provider acme returned unexpected finish reason: unknown_reason.",
			},
			incomplete_details: null,
		});
	});
});
