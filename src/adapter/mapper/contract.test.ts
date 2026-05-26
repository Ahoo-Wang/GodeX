import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type { StreamMapper } from "./contract";

describe("StreamMapper contract", () => {
	test("maps provider stream events to response stream events", () => {
		const mapper: StreamMapper<unknown> = {
			map: (_ctx: ResponsesContext, _event: JsonServerSentEvent<unknown>) => [
				{ type: "response.created" },
			],
		};

		expect(mapper).toBeDefined();
	});

	test("rejects stream mappers that still expose final response builders", () => {
		const mapper: StreamMapper<unknown> = {
			map: () => [],
			// @ts-expect-error StreamMapper no longer builds final responses.
			buildResponseObject: () => ({}),
		};

		expect(mapper).toBeDefined();
	});
});
