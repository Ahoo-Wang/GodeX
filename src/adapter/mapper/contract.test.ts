import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseObject } from "../../protocol/openai/responses";
import type { StreamMapper } from "./contract";
import type { StreamState } from "./stream-state";

describe("StreamMapper contract", () => {
	test("requires a final response builder for session persistence", () => {
		const response: ResponseObject = {
			id: "resp_1",
			object: "response",
			created_at: 1,
			status: "completed",
			model: "test",
			output: [],
		};
		const mapper: StreamMapper<unknown> = {
			map: () => [],
			buildResponseObject: (_ctx: ResponsesContext, _state: StreamState) =>
				response,
		};

		expect(
			mapper.buildResponseObject({} as ResponsesContext, {} as StreamState),
		).toBe(response);
	});

	test("rejects stream mappers that cannot build a final response", () => {
		// @ts-expect-error StreamMapper must build a final ResponseObject.
		const mapper: StreamMapper<unknown> = { map: () => [] };

		expect(mapper).toBeDefined();
	});
});
