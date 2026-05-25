import { describe, expect, test } from "bun:test";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import { ZhipuProvider } from "../zhipu/provider";
import {
	OpenAIProvider,
	type OpenAIProviderResponsibilities,
} from "./provider";

describe("OpenAIProvider", () => {
	test("composes provider responsibilities into the Provider mapper contract", () => {
		type TestRequest = { prompt: string };
		type TestResponse = { text: string };
		type TestChunk = { delta: string };

		const request = { map: () => ({ prompt: "hello" }) };
		const response = {
			map: () =>
				({
					id: "resp_test",
					object: "response",
					created_at: 1,
					status: "completed",
					model: "test",
					output: [],
				}) satisfies ResponseObject,
		};
		const stream = {
			map: () => [] satisfies ResponseStreamEvent[],
			buildResponseObject: () =>
				({
					id: "resp_test",
					object: "response",
					created_at: 1,
					status: "completed",
					model: "test",
					output: [],
				}) satisfies ResponseObject,
		};
		const client = {
			request: async () => ({ text: "hello" }),
			stream: async () => new ReadableStream(),
		};

		const responsibilities: OpenAIProviderResponsibilities<
			TestRequest,
			TestResponse,
			TestChunk
		> = {
			name: "test-openai-compatible",
			client,
			request,
			response,
			stream,
		};

		const provider = new OpenAIProvider(responsibilities);

		expect(provider.name).toBe("test-openai-compatible");
		expect(provider.client).toBe(client);
		expect(provider.mapper.request).toBe(request);
		expect(provider.mapper.response).toBe(response);
		expect(provider.mapper.stream).toBe(stream);
	});

	test("lets Zhipu integrate through the OpenAI provider abstraction", () => {
		const provider = new ZhipuProvider("http://localhost:13145/v1", "test-key");

		expect(provider).toBeInstanceOf(OpenAIProvider);
		expect(provider.name).toBe("zhipu");
		expect(provider.mapper.request).toBeDefined();
		expect(provider.mapper.response).toBeDefined();
		expect(provider.mapper.stream).toBeDefined();
		expect(provider.client).toBeDefined();
	});
});
