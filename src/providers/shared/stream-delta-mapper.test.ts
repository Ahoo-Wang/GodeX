import { describe, expect, test } from "bun:test";
import { mapCommonChatStreamDelta } from "./stream-delta-mapper";

describe("mapCommonChatStreamDelta", () => {
	test("maps reasoning content and provider tool call fragments", () => {
		expect(
			mapCommonChatStreamDelta({
				reasoning_content: "think",
				tool_calls: [
					{
						index: 1,
						id: "call_1",
						type: "function",
						function: {
							name: "lookup",
							arguments: '{"q":"x"}',
						},
					},
					{},
				],
			}),
		).toEqual([
			{ reasoning: "think" },
			{
				toolCall: {
					index: 1,
					id: "call_1",
					type: "function",
					name: "lookup",
					arguments: '{"q":"x"}',
				},
			},
		]);
	});

	test("omits empty tool call fragments", () => {
		expect(mapCommonChatStreamDelta({ tool_calls: [{}] })).toEqual([]);
	});
});
