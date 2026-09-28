import { describe, expect, test } from "bun:test";
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import { PROVIDER_UPSTREAM_ERROR, ProviderError } from "../../error";
import {
	EXAMPLE_PROVIDER_SPEC,
	type ExampleChatChunk,
	type ExampleChatRequest,
	type ExampleChatResponse,
} from "../../providers/example";
import { createProviderEdge } from "./factory";
import { validateProviderPackageShape } from "./validation";

const runtimeConfig = {
	spec: "example",
	credentials: { api_key: "test-key" },
	endpoint: { base_url: "https://example.test" },
};

describe("createProviderEdge", () => {
	test("creates a provider edge from spec and runtime config", () => {
		const edge = createProviderEdge({
			spec: EXAMPLE_PROVIDER_SPEC,
			config: runtimeConfig,
		});

		expect(edge.name).toBe("example");
		expect(edge.spec).toBe(EXAMPLE_PROVIDER_SPEC);
		expect("config" in edge).toBeFalse();
	});

	test("patches request bodies and normalizes responses around request impl", async () => {
		const seenBodies: ExampleChatRequest[] = [];
		const patchedBodies: ExampleChatRequest[] = [];
		const preparedBodies: ExampleChatRequest[] = [];
		const spec = {
			...EXAMPLE_PROVIDER_SPEC,
			hooks: {
				patchRequest: (body: ExampleChatRequest): ExampleChatRequest => ({
					...body,
					messages: [...body.messages, { role: "system", content: "patched" }],
				}),
				normalizeResponse: (
					response: ExampleChatResponse,
				): ExampleChatResponse => ({
					...response,
					choices: [
						{
							...response.choices[0],
							message: { content: `${response.choices[0]?.message.content}!` },
						},
					],
				}),
			},
		};

		const edge = createProviderEdge({
			spec,
			config: runtimeConfig,
			request: async (body) => {
				seenBodies.push(body);
				return {
					choices: [
						{
							message: { role: "assistant", content: "hello" },
							finish_reason: "stop",
						},
					],
				};
			},
		});

		const response = await edge.request(
			{
				model: "example/test",
				messages: [{ role: "user", content: "hi" }],
			},
			{
				onPatchedRequest: (body) => {
					patchedBodies.push(body);
				},
				onRequestPrepared: (body) => {
					preparedBodies.push(body);
				},
			},
		);

		expect(seenBodies).toEqual([
			{
				model: "example/test",
				messages: [
					{ role: "user", content: "hi" },
					{ role: "system", content: "patched" },
				],
			},
		]);
		expect(patchedBodies).toEqual(seenBodies);
		expect(preparedBodies).toEqual(seenBodies);
		expect(response.choices[0]?.message.content).toBe("hello!");
	});

	test("patches stream request bodies before calling stream impl", async () => {
		let seenBody: ExampleChatRequest | undefined;
		let patchedBody: ExampleChatRequest | undefined;
		let preparedBody: ExampleChatRequest | undefined;
		const spec = {
			...EXAMPLE_PROVIDER_SPEC,
			hooks: {
				patchRequest: (body: ExampleChatRequest): ExampleChatRequest => ({
					...body,
					model: `${body.model}-patched`,
				}),
			},
		};
		const stream = new ReadableStream();
		const edge = createProviderEdge({
			spec,
			config: runtimeConfig,
			stream: async (body) => {
				seenBody = body;
				return stream;
			},
		});

		await edge.stream(
			{
				model: "example/test",
				messages: [{ role: "user", content: "hi" }],
			},
			{
				onPatchedRequest: (body) => {
					patchedBody = body;
				},
				onRequestPrepared: (body) => {
					preparedBody = body;
				},
			},
		);

		expect(seenBody?.model).toBe("example/test-patched");
		expect(patchedBody).toEqual(seenBody);
		expect(preparedBody).toEqual(seenBody);
	});

	test("normalizes stream chunks before returning provider event stream", async () => {
		const spec = {
			...EXAMPLE_PROVIDER_SPEC,
			hooks: {
				normalizeChunk: (chunk: ExampleChatChunk): ExampleChatChunk => ({
					...chunk,
					choices: chunk.choices.map((choice) => ({
						...choice,
						delta: { content: `${choice.delta.content ?? ""}!` },
					})),
				}),
			},
		};
		const chunk: ExampleChatChunk = {
			choices: [{ delta: { content: "hello" }, finish_reason: null }],
		};
		const edge = createProviderEdge({
			spec,
			config: runtimeConfig,
			stream: async () =>
				new ReadableStream<JsonServerSentEvent<ExampleChatChunk>>({
					start(controller) {
						controller.enqueue({ event: "message", data: chunk });
						controller.close();
					},
				}),
		});

		const reader = (
			await edge.stream({ model: "example/test", messages: [] })
		).getReader();
		const read = await reader.read();

		expect(read.value?.data.choices[0]?.delta.content).toBe("hello!");
	});

	test("throws ProviderError when request implementation is not configured", async () => {
		const edge = createProviderEdge({
			spec: EXAMPLE_PROVIDER_SPEC,
			config: runtimeConfig,
		});
		const patchedBodies: ExampleChatRequest[] = [];
		const preparedBodies: ExampleChatRequest[] = [];

		await expect(
			edge.request(
				{ model: "example/test", messages: [] },
				{
					onPatchedRequest: (body) => {
						patchedBodies.push(body);
					},
					onRequestPrepared: (body) => {
						preparedBodies.push(body);
					},
				},
			),
		).rejects.toBeInstanceOf(ProviderError);
		await expect(
			edge.request({ model: "example/test", messages: [] }),
		).rejects.toMatchObject({
			code: PROVIDER_UPSTREAM_ERROR,
			context: {
				provider: "example",
				model: "example/test",
				upstreamStatus: 0,
				operation: "request",
				spec: "example",
				endpointBaseURL: "https://example.test",
			},
		});
		expect(patchedBodies).toEqual([{ model: "example/test", messages: [] }]);
		expect(preparedBodies).toEqual([]);
	});

	test("throws ProviderError when stream implementation is not configured", async () => {
		const edge = createProviderEdge({
			spec: EXAMPLE_PROVIDER_SPEC,
			config: runtimeConfig,
		});
		const patchedBodies: ExampleChatRequest[] = [];
		const preparedBodies: ExampleChatRequest[] = [];

		await expect(
			edge.stream(
				{ model: "example/test", messages: [] },
				{
					onPatchedRequest: (body) => {
						patchedBodies.push(body);
					},
					onRequestPrepared: (body) => {
						preparedBodies.push(body);
					},
				},
			),
		).rejects.toBeInstanceOf(ProviderError);
		await expect(
			edge.stream({ model: "example/test", messages: [] }),
		).rejects.toMatchObject({
			code: PROVIDER_UPSTREAM_ERROR,
			context: {
				provider: "example",
				model: "example/test",
				upstreamStatus: 0,
				operation: "stream",
				spec: "example",
				endpointBaseURL: "https://example.test",
			},
		});
		expect(patchedBodies).toEqual([{ model: "example/test", messages: [] }]);
		expect(preparedBodies).toEqual([]);
	});
});

describe("example provider spec", () => {
	test("passes ProviderSpec package shape validation", () => {
		expect(
			validateProviderPackageShape("example", [
				"src/providers/example/spec.ts",
				"src/providers/example/client.ts",
				"src/providers/example/index.ts",
			]),
		).toEqual([]);
	});

	test("maps chat completion response text, finish reason, and usage details", () => {
		const response: ExampleChatResponse = {
			choices: [
				{
					message: { role: "assistant", content: "hello" },
					finish_reason: "stop",
				},
			],
			usage: {
				prompt_tokens: 3,
				completion_tokens: 5,
				total_tokens: 8,
				prompt_tokens_details: { cached_tokens: 2 },
				completion_tokens_details: { reasoning_tokens: 1 },
			},
		};

		expect(EXAMPLE_PROVIDER_SPEC.response.firstChoice(response)).toBe(
			response.choices[0],
		);
		expect(EXAMPLE_PROVIDER_SPEC.response.outputText(response)).toBe("hello");
		expect(EXAMPLE_PROVIDER_SPEC.response.finishReason(response)).toBe("stop");
		expect(EXAMPLE_PROVIDER_SPEC.response.usage(response)).toEqual({
			input_tokens: 3,
			output_tokens: 5,
			total_tokens: 8,
			input_tokens_details: { cached_tokens: 2 },
			output_tokens_details: { reasoning_tokens: 1 },
		});
	});

	test("rejects malformed provider usage values", () => {
		const response = {
			choices: [
				{
					message: { role: "assistant", content: "hello" },
					finish_reason: "stop",
				},
			],
			usage: {
				prompt_tokens: "3",
				completion_tokens: 5,
				total_tokens: 8,
			},
		} as unknown as ExampleChatResponse;

		expect(() => EXAMPLE_PROVIDER_SPEC.response.usage(response)).toThrow(
			ProviderError,
		);
	});

	test("rejects malformed provider usage detail values", () => {
		const response = {
			choices: [
				{
					message: { role: "assistant", content: "hello" },
					finish_reason: "stop",
				},
			],
			usage: {
				prompt_tokens: 3,
				completion_tokens: 5,
				total_tokens: 8,
				completion_tokens_details: { reasoning_tokens: "bad" },
			},
		} as unknown as ExampleChatResponse;

		expect(() => EXAMPLE_PROVIDER_SPEC.response.usage(response)).toThrow(
			ProviderError,
		);
	});

	test("strips unknown provider usage detail fields", () => {
		const response = {
			choices: [
				{
					message: { role: "assistant", content: "hello" },
					finish_reason: "stop",
				},
			],
			usage: {
				prompt_tokens: 3,
				completion_tokens: 5,
				total_tokens: 8,
				prompt_tokens_details: { cached_tokens: 2, vendor_tokens: 99 },
			},
		} as unknown as ExampleChatResponse;

		expect(EXAMPLE_PROVIDER_SPEC.response.usage(response)).toEqual({
			input_tokens: 3,
			output_tokens: 5,
			total_tokens: 8,
			input_tokens_details: { cached_tokens: 2 },
		});
	});

	test("maps stream chunks without undefined fields", () => {
		const chunk: ExampleChatChunk = {
			choices: [
				{ delta: { content: "he" }, finish_reason: null },
				{ delta: {}, finish_reason: "stop" },
			],
			usage: { prompt_tokens: 3, completion_tokens: 5, total_tokens: 8 },
		};

		expect(EXAMPLE_PROVIDER_SPEC.stream.deltas(chunk)).toEqual([
			{ text: "he" },
			{ finishReason: "stop" },
			{ usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } },
		]);
	});
});
