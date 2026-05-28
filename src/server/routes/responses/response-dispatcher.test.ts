import { describe, expect, test } from "bun:test";
import { createResponsesContext } from "../../../context/responses-context-factory";
import type { ResponseStreamEvent } from "../../../protocol/openai/responses";
import { dispatchResponseRequest } from "./response-dispatcher";
import { basicRequest, createTestApp, responseObject } from "./test-fixtures";

describe("dispatchResponseRequest", () => {
	test("dispatches non-stream requests through responses.request", async () => {
		const app = createTestApp();
		const ctx = await createResponsesContext(app, basicRequest);
		let requestCalls = 0;
		let streamCalls = 0;
		Object.defineProperty(app, "responses", {
			value: {
				async request() {
					requestCalls++;
					return responseObject(ctx);
				},
				async stream() {
					streamCalls++;
					return new ReadableStream<ResponseStreamEvent>();
				},
			},
		});

		const res = await dispatchResponseRequest(ctx, app);

		expect(res.status).toBe(200);
		expect(requestCalls).toBe(1);
		expect(streamCalls).toBe(0);
		const body = (await res.json()) as { id: string };
		expect(body.id).toBe(ctx.responseId);
	});

	test("dispatches stream requests through responses.stream and encodes SSE", async () => {
		const app = createTestApp();
		const ctx = await createResponsesContext(app, {
			...basicRequest,
			stream: true,
		});
		let requestCalls = 0;
		let streamCalls = 0;
		Object.defineProperty(app, "responses", {
			value: {
				async request() {
					requestCalls++;
					return responseObject(ctx);
				},
				async stream() {
					streamCalls++;
					return new ReadableStream<ResponseStreamEvent>({
						start(controller) {
							controller.enqueue({
								type: "response.completed",
								response: responseObject(ctx),
							});
							controller.close();
						},
					});
				},
			},
		});

		const res = await dispatchResponseRequest(ctx, app);

		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/event-stream");
		expect(res.headers.get("cache-control")).toBe("no-cache");
		expect(requestCalls).toBe(0);
		expect(streamCalls).toBe(1);
		const text = await res.text();
		expect(text).toContain("event: response.completed");
		expect(text).toContain(`"sequence_number":0`);
	});
});
