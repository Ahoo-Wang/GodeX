import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../../context/responses-context";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
import { responseRequestLogEntry } from "./request-log";

function context(): ResponsesContext {
	return {
		resolved: {
			provider: "zhipu",
			model: "glm-5.1",
		},
	} as ResponsesContext;
}

describe("responseRequestLogEntry", () => {
	test("builds snake_case request metadata", () => {
		const body = {
			model: "zhipu/glm-5.1",
			input: ["hi", "there"],
			stream: true,
			previous_response_id: "resp_1",
			store: false,
			tools: [{ type: "function", name: "lookup" }],
			safety_identifier: "safe-1",
			prompt_cache_key: "cache-key",
			prompt_cache_retention: "24h",
			service_tier: "default",
			background: false,
			max_tool_calls: 2,
			parallel_tool_calls: true,
			context_management: [{ type: "auto" }],
		} as unknown as ResponseCreateRequest;

		const entry = responseRequestLogEntry(body, context());

		expect(entry).toEqual({
			model: "zhipu/glm-5.1",
			resolved: { provider: "zhipu", model: "glm-5.1" },
			stream: true,
			previous_response_id: "resp_1",
			store: false,
			input_count: 2,
			tools_count: 1,
			safety_identifier: "safe-1",
			prompt_cache_key: "cache-key",
			prompt_cache_retention: "24h",
			service_tier: "default",
			background: false,
			max_tool_calls: 2,
			parallel_tool_calls: true,
			context_management: [{ type: "auto" }],
		});
		expect(entry).not.toHaveProperty("inputCount");
		expect(entry).not.toHaveProperty("previousResponseId");
	});

	test.each([
		["array input", ["a", "b"], 2],
		["single input", "a", 1],
		["empty input", undefined, 0],
	])("counts %s", (_name, input, expected) => {
		const entry = responseRequestLogEntry(
			{
				model: "zhipu/glm-5.1",
				input,
			} as unknown as ResponseCreateRequest,
			context(),
		);

		expect(entry.input_count).toBe(expected);
	});
});
