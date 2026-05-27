import { describe, expect, test } from "bun:test";
import type { ProviderClient, ProviderMapper } from "../adapter/provider";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { createProviderBundle } from "./provider-bundle";

describe("createProviderBundle", () => {
	test("creates a provider and preserves mapper and client identity", () => {
		const mapper: ProviderMapper<
			{ prompt: string },
			{ text: string },
			{ delta: string }
		> = {
			request: { map: () => ({ prompt: "hello" }) },
			response: {
				map: () =>
					({
						id: "resp_test",
						object: "response",
						created_at: 1,
						status: "completed",
						model: "test",
						output: [],
					}) satisfies ResponseObject,
			},
			stream: { map: () => [] satisfies ResponseStreamEvent[] },
		};
		const client: ProviderClient<
			{ prompt: string },
			{ text: string },
			{ delta: string }
		> = {
			request: async () => ({ text: "hello" }),
			stream: async () => new ReadableStream(),
		};

		const provider = createProviderBundle({
			name: "test-provider",
			mapper,
			client,
		});

		expect(provider.name).toBe("test-provider");
		expect(provider.mapper).toBe(mapper);
		expect(provider.client).toBe(client);
	});
});
