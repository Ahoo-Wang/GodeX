import { describe, expect, test } from "bun:test";
import { DEFAULT_CAPABILITIES } from "./capabilities";
import type { ChatClient } from "./chatClient";
import type {
	RequestMapper,
	ResponseMapper,
	StreamMapper,
} from "./mapper/contract";
import type { Provider } from "./provider";

describe("Provider", () => {
	test("composes mapper and chatClient", () => {
		const requestMapper: RequestMapper<unknown> = { map: () => ({}) };
		const responseMapper: ResponseMapper<unknown> = {
			map: () => ({}) as never,
		};
		const streamMapper: StreamMapper<unknown> = {
			map: () => [] as never[],
			buildResponseObject: () => ({}) as never,
		};
		const chatClient: ChatClient<unknown, unknown, unknown> = {
			chat: async () => ({}),
			streamChat: async () => new ReadableStream(),
		};

		const provider: Provider<unknown, unknown, unknown> = {
			name: "mock",
			capabilities: DEFAULT_CAPABILITIES,
			mapper: {
				request: requestMapper,
				response: responseMapper,
				stream: streamMapper,
			},
			chatClient,
		};

		expect(provider.mapper.request).toBe(requestMapper);
		expect(provider.mapper.response).toBe(responseMapper);
		expect(provider.mapper.stream).toBe(streamMapper);
		expect(provider.chatClient).toBe(chatClient);
	});
});
