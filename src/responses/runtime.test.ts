import { describe, expect, test } from "bun:test";
import type { ProviderEdge } from "../bridge/provider-spec";
import { OutputContractSlot } from "../context/output-contract-slot";
import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import type { ResponseSessionStore, StoredResponseSession } from "../session";
import {
	completedTextResponse,
	createTestProviderEdge,
} from "../testing/provider-edge";
import { ResponsesBridgeRuntime } from "./runtime";

function createMockProvider(
	text = "",
	streamEvents: Array<{ event: string; data: unknown }> = [],
): ProviderEdge<unknown, unknown, unknown> {
	return createTestProviderEdge({
		name: "mock",
		response: completedTextResponse(text),
		streamEvents,
	});
}

function createMockSessionStore(): ResponseSessionStore & {
	saved: StoredResponseSession[];
} {
	const saved: StoredResponseSession[] = [];
	return {
		saved,
		get: async () => null,
		save: async (session: StoredResponseSession) => {
			saved.push(session);
		},
		resolveChain: async () =>
			({
				previous_response_id: "none",
				turns: [],
				input_items: [],
			}) as never,
		delete: async () => {},
	};
}

function createMockCtx(
	provider: ProviderEdge<unknown, unknown, unknown>,
	sessionStore: ResponseSessionStore,
): ResponsesContext {
	return {
		provider,
		app: {
			sessionStore,
			traceEnabled: true,
			traceRecorder: { record: () => {} },
		},
		logger: {
			info: () => {},
			debug: () => {},
			trace: () => {},
			error: () => {},
			warn: () => {},
		},
		request: { model: "mock/test", input: "hello", store: true },
		requestId: "req_test",
		responseId: "resp_123",
		createdAt: Math.floor(Date.now() / 1000),
		resolved: { provider: "test", model: "test" },
		diagnostics: [],
		addDiagnostic() {},
		attributes: new Map(),
		outputContract: new OutputContractSlot(),
		session: null,
	} as unknown as ResponsesContext;
}

async function readStream<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const chunks: T[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return chunks;
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

describe("ResponsesBridgeRuntime", () => {
	test("default construction wires a working sync pipeline", async () => {
		const provider = createMockProvider("sync text");
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const result = await new ResponsesBridgeRuntime().request(ctx);

		expect(result).toMatchObject({
			id: "resp_123",
			status: "completed",
			output_text: "sync text",
		});
		expect(sessionStore.saved[0]?.id).toBe("resp_123");
	});

	test("default construction wires a working stream pipeline", async () => {
		const provider = createMockProvider("", [
			{ event: "chunk", data: { text: "stream text", finishReason: "stop" } },
		]);
		const sessionStore = createMockSessionStore();
		const ctx = createMockCtx(provider, sessionStore);

		const events = await readStream(
			await new ResponsesBridgeRuntime().stream(ctx),
		);

		expect(events.at(-1)).toMatchObject({
			type: "response.completed",
			response: { id: "resp_123", output_text: "stream text" },
		});
		expect(sessionStore.saved[0]?.id).toBe("resp_123");
	});

	test("delegates request and stream to injected pipelines", async () => {
		const ctx = {} as ResponsesContext;
		const responseObject = {
			id: "resp_injected",
			object: "response",
			status: "completed",
			model: "test",
			created_at: 1,
			output: [],
		} as ResponseObject;
		const stream = new ReadableStream<ResponseStreamEvent>();
		const calls: Array<{ pipeline: string; ctx: ResponsesContext }> = [];
		const bridge = new ResponsesBridgeRuntime(
			{
				request: async (receivedCtx) => {
					calls.push({ pipeline: "sync", ctx: receivedCtx });
					return responseObject;
				},
			},
			{
				stream: async (receivedCtx) => {
					calls.push({ pipeline: "stream", ctx: receivedCtx });
					return stream;
				},
			},
		);

		const responseResult = await bridge.request(ctx);
		const streamResult = await bridge.stream(ctx);

		expect(responseResult).toBe(responseObject);
		expect(streamResult).toBe(stream);
		expect(calls).toEqual([
			{ pipeline: "sync", ctx },
			{ pipeline: "stream", ctx },
		]);
	});
});
