import { describe, expect, test } from "bun:test";
import { BridgeError } from "../../error";
import type { ResponseUsage } from "../../protocol/openai/responses";
import { ToolIdentityMap } from "../tools";
import { ResponseStreamStateMachine } from "./response-stream-state-machine";
import { mapProviderDeltasToEvents } from "./stream-reconstructor";

const usage: ResponseUsage = {
	input_tokens: 1,
	output_tokens: 2,
	total_tokens: 3,
};

function machine(toolIdentities?: ToolIdentityMap): ResponseStreamStateMachine {
	return new ResponseStreamStateMachine({
		responseId: "resp_test",
		createdAt: 1_764_000_000,
		model: "resolved-model",
		provider: "deepseek",
		nowSeconds: () => 1_764_000_010,
		toolIdentities,
	});
}

describe("mapProviderDeltasToEvents", () => {
	test("maps deltas in order and stops after terminal finish", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [
				{ text: "Hel" },
				{ text: "lo" },
				{ usage },
				{ finishReason: "stop" },
				{ text: "ignored" },
			],
		});

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			status: "completed",
			output_text: "Hello",
			usage,
		});
	});

	test("routes provider error delta to failed event and ignores later deltas", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [
				{ text: "before" },
				{ error: { code: "upstream_error", message: "bad chunk" } },
				{ text: "ignored" },
				{ finishReason: "stop" },
			],
		});

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.content_part.added",
			"response.output_text.delta",
			"response.output_text.done",
			"response.content_part.done",
			"response.output_item.done",
			"response.failed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			status: "failed",
			error: { code: "server_error", message: "bad chunk" },
			output_text: "before",
		});
	});

	test("starts before failing when first provider delta is error", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [
				{ error: { code: "upstream_error", message: "bad first chunk" } },
				{ text: "ignored" },
			],
		});

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.failed",
		]);
		expect(events.at(-1)?.response).toMatchObject({
			status: "failed",
			error: { code: "server_error", message: "bad first chunk" },
			output: [],
		});
	});

	test("rejects empty provider deltas without starting", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [{}],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.output).toEqual([]);
	});

	test("rejects unknown provider delta fields without starting", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [{ foo: "bar" }],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.output).toEqual([]);
	});

	test("rejects non-string text without appending output", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [{ text: 1 } as never],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.output).toEqual([]);
		expect(state.snapshot.output_text).toBe("");
		expect(state.snapshot.status).toBe("queued");
	});

	test("rejects usage with missing token fields without starting", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [{ usage: {} }],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.usage).toBeNull();
	});

	test("rejects usage with non-finite token fields", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [
					{
						usage: {
							input_tokens: 1,
							output_tokens: 2,
							total_tokens: Number.NaN,
						},
					},
				],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.usage).toBeNull();
	});

	test("rejects malformed usage token details", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [
					{
						usage: {
							input_tokens: 1,
							output_tokens: 2,
							total_tokens: 3,
							input_tokens_details: "bad",
						},
					},
				],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.usage).toBeNull();
	});

	test("rejects malformed usage output token details", () => {
		const state = machine();

		expect(() =>
			mapProviderDeltasToEvents({
				machine: state,
				deltas: [
					{
						usage: {
							input_tokens: 1,
							output_tokens: 2,
							total_tokens: 3,
							output_tokens_details: { reasoning_tokens: "x" },
						},
					},
				],
			}),
		).toThrow(BridgeError);
		expect(state.snapshot.status).toBe("queued");
		expect(state.snapshot.usage).toBeNull();
	});

	test("sanitizes unknown usage detail fields", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [
				{
					usage: {
						input_tokens: 1,
						output_tokens: 2,
						total_tokens: 3,
						input_tokens_details: {
							cached_tokens: 1,
							ignored: 99,
						},
						output_tokens_details: {
							reasoning_tokens: 2,
							ignored: 88,
						},
						ignored: 77,
					},
				},
				{ finishReason: "stop" },
			],
		});

		expect(events.at(-1)?.response?.usage).toEqual({
			input_tokens: 1,
			output_tokens: 2,
			total_tokens: 3,
			input_tokens_details: { cached_tokens: 1 },
			output_tokens_details: { reasoning_tokens: 2 },
		});
	});

	test("can defer terminal finish so later usage chunks reach completed response", () => {
		const state = machine();
		const firstEvents = mapProviderDeltasToEvents({
			machine: state,
			deferTerminal: true,
			deltas: [{ text: "Hello" }, { finishReason: "stop" }],
		});
		const usageEvents = mapProviderDeltasToEvents({
			machine: state,
			deferTerminal: true,
			deltas: [{ usage }],
		});
		const terminalEvents = state.finish(state.deferredFinishReason);

		expect(firstEvents.map((event) => event.type)).not.toContain(
			"response.completed",
		);
		expect(usageEvents).toEqual([]);
		expect(terminalEvents.at(-1)?.response).toMatchObject({
			status: "completed",
			output_text: "Hello",
			usage,
		});
	});

	test("accumulates streaming tool call deltas into a restored Responses output item", () => {
		const identities = new ToolIdentityMap();
		identities.add({
			requestedName: "lookup.weather",
			providerName: "lookup_weather",
			requestedType: "function",
			providerType: "function",
		});

		const events = mapProviderDeltasToEvents({
			machine: machine(identities),
			deltas: [
				{
					toolCall: {
						index: 0,
						id: "call_1",
						name: "lookup_weather",
						arguments: '{"city"',
					},
				},
				{ toolCall: { index: 0, arguments: ':"Paris"}' } },
				{ finishReason: "tool_calls" },
			],
		});

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.in_progress",
			"response.output_item.added",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.delta",
			"response.function_call_arguments.done",
			"response.output_item.done",
			"response.completed",
		]);
		expect(events[2]?.item).toMatchObject({
			id: "call_1",
			type: "function_call",
			call_id: "call_1",
			name: "lookup.weather",
			arguments: "",
		});
		expect(events.at(-2)?.item).toMatchObject({
			id: "call_1",
			type: "function_call",
			call_id: "call_1",
			name: "lookup.weather",
			arguments: '{"city":"Paris"}',
		});
		expect(events.at(-1)?.response?.output).toEqual([
			expect.objectContaining({
				id: "call_1",
				type: "function_call",
				call_id: "call_1",
				name: "lookup.weather",
				arguments: '{"city":"Paris"}',
			}),
		]);
	});

	test("keeps stream tool call item id stable when provider id arrives later", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [
				{
					toolCall: {
						index: 0,
						name: "lookup_weather",
						arguments: '{"city"',
					},
				},
				{
					toolCall: {
						index: 0,
						id: "call_real_id",
						arguments: ':"Paris"}',
					},
				},
				{ finishReason: "tool_calls" },
			],
		});

		const added = events.find(
			(event) => event.type === "response.output_item.added",
		);
		const argumentsDone = events.find(
			(event) => event.type === "response.function_call_arguments.done",
		);
		const itemDone = events.find(
			(event) => event.type === "response.output_item.done",
		);

		expect(added?.item).toMatchObject({
			id: "fc_resp_test_0",
			type: "function_call",
		});
		expect(argumentsDone).toMatchObject({
			item_id: "fc_resp_test_0",
		});
		expect(itemDone?.item).toMatchObject({
			id: "fc_resp_test_0",
			call_id: "call_real_id",
			arguments: '{"city":"Paris"}',
		});
	});

	test("rejects null tool call deltas at the sandbox boundary", () => {
		expect(() =>
			mapProviderDeltasToEvents({
				machine: machine(),
				deltas: [{ toolCall: null } as never],
			}),
		).toThrow(BridgeError);
	});

	test("maps reasoning deltas into reasoning output items", () => {
		const state = machine();

		const events = mapProviderDeltasToEvents({
			machine: state,
			deltas: [{ reasoning: "think" }, { text: "answer" }],
		});

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "response.reasoning_text.delta",
				delta: "think",
			}),
		);
		expect(state.snapshot.output).toEqual([
			expect.objectContaining({
				type: "reasoning",
				status: "in_progress",
			}),
			expect.objectContaining({ type: "message" }),
		]);
		expect(state.snapshot.output_text).toBe("answer");
	});

	test("maps refusal deltas into refusal content blocks", () => {
		const events = mapProviderDeltasToEvents({
			machine: machine(),
			deltas: [{ refusal: "I cannot help." }, { finishReason: "stop" }],
		});

		expect(events).toContainEqual(
			expect.objectContaining({
				type: "response.refusal.delta",
				delta: "I cannot help.",
			}),
		);
		expect(events).toContainEqual(
			expect.objectContaining({
				type: "response.refusal.done",
				refusal: "I cannot help.",
			}),
		);
		expect(events.at(-1)?.response?.output).toEqual([
			expect.objectContaining({
				type: "message",
				status: "completed",
				content: [{ type: "refusal", refusal: "I cannot help." }],
			}),
		]);
	});

	for (const [name, delta, parameter] of [
		["non-object delta", null, "delta"],
		["non-string refusal", { refusal: 1 }, "refusal"],
		["non-string reasoning", { reasoning: false }, "reasoning"],
		["empty tool call", { toolCall: {} }, "toolCall"],
		["negative tool call index", { toolCall: { index: -1 } }, "toolCall.index"],
		["non-string tool call id", { toolCall: { id: 1 } }, "toolCall.id"],
		[
			"unknown tool call field",
			{ toolCall: { index: 0, extra: "x" } },
			"toolCall.extra",
		],
		["non-object usage", { usage: "bad" }, "usage"],
		[
			"non-object output token details",
			{
				usage: {
					input_tokens: 1,
					output_tokens: 2,
					total_tokens: 3,
					output_tokens_details: "bad",
				},
			},
			"usage.output_tokens_details",
		],
		["non-object error", { error: "bad" }, "error"],
		[
			"non-string error code",
			{ error: { code: 1, message: "bad" } },
			"error.code",
		],
		["missing error message", { error: { code: "bad" } }, "error.message"],
		["non-string finish reason", { finishReason: 1 }, "finishReason"],
	] as const) {
		test(`rejects malformed stream delta: ${name}`, () => {
			const state = machine();
			const error = captureBridgeError(() =>
				mapProviderDeltasToEvents({
					machine: state,
					deltas: [delta as never],
				}),
			);

			expect(error.context).toMatchObject({
				provider: "deepseek",
				model: "resolved-model",
				parameter,
			});
			expect(state.snapshot.status).toBe("queued");
			expect(state.snapshot.output).toEqual([]);
		});
	}
});

function captureBridgeError(action: () => unknown): BridgeError {
	try {
		action();
	} catch (error) {
		if (error instanceof BridgeError) return error;
		throw error;
	}
	throw new Error("Expected BridgeError.");
}
