import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type {
	ResponseCreateRequest,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { collectGodexStreamEvents, godexClient } from "./godex-client";
import { getLoopbackPort } from "./ports";

let server: ReturnType<typeof Bun.serve> | undefined;
let baseURL = "";
const requests: Array<{ path: string; auth: string | null; body?: unknown }> =
	[];

beforeAll(async () => {
	const port = await getLoopbackPort();
	server = Bun.serve({
		hostname: "127.0.0.1",
		port,
		async fetch(req) {
			const url = new URL(req.url);
			if (url.pathname === "/health") {
				requests.push({
					path: url.pathname,
					auth: req.headers.get("authorization"),
				});
				return Response.json({ status: "ok", timestamp: 123 });
			}
			if (url.pathname === "/v1/models") {
				requests.push({
					path: url.pathname,
					auth: req.headers.get("authorization"),
				});
				return Response.json({
					object: "list",
					data: [{ id: "gpt-5", object: "model", owned_by: "zhipu" }],
				});
			}
			if (url.pathname === "/v1/responses" && req.method === "POST") {
				const body = (await req.json()) as ResponseCreateRequest;
				requests.push({
					path: url.pathname,
					auth: req.headers.get("authorization"),
					body,
				});
				if (body.stream) return streamResponse();
				return Response.json({
					id: "resp_client_test",
					object: "response",
					created_at: 1,
					completed_at: 2,
					status: "completed",
					model: "glm-5.1",
					output: [],
				});
			}
			return Response.json(
				{ error: { code: "not_found", message: "not found" } },
				{ status: 404 },
			);
		},
	});
	baseURL = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
	server?.stop();
});

function streamResponse(): Response {
	const encoder = new TextEncoder();
	const events: ResponseStreamEvent[] = [
		{
			type: "response.created",
			response: {
				id: "resp_stream_client_test",
				object: "response",
				created_at: 1,
				status: "in_progress",
				model: "glm-5.1",
				output: [],
			},
		},
		{
			type: "response.completed",
			response: {
				id: "resp_stream_client_test",
				object: "response",
				created_at: 1,
				completed_at: 2,
				status: "completed",
				model: "glm-5.1",
				output: [],
			},
		},
	];
	return new Response(
		new ReadableStream({
			start(controller) {
				for (const event of events) {
					controller.enqueue(
						encoder.encode(
							`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
						),
					);
				}
				controller.close();
			},
		}),
		{ headers: { "Content-Type": "text/event-stream" } },
	);
}

describe("godexClient", () => {
	test("calls health, models, sync responses, and streaming responses through Fetcher decorators", async () => {
		requests.length = 0;
		const client = godexClient({ baseURL, apiKey: "test-key" });

		await expect(client.health.get()).resolves.toMatchObject({ status: "ok" });
		await expect(client.models.list()).resolves.toMatchObject({
			object: "list",
			data: [{ id: "gpt-5" }],
		});
		await expect(
			client.responses.create({ model: "gpt-5", input: "Hello!" }),
		).resolves.toMatchObject({
			id: "resp_client_test",
			status: "completed",
		});
		const stream = await client.responses.stream({
			model: "gpt-5",
			input: "Hello!",
			stream: true,
		});
		const events = await collectGodexStreamEvents(stream);

		expect(events.map((event) => event.type)).toEqual([
			"response.created",
			"response.completed",
		]);
		expect(requests.map((request) => request.path)).toEqual([
			"/health",
			"/v1/models",
			"/v1/responses",
			"/v1/responses",
		]);
		expect(
			requests.every((request) => request.auth === "Bearer test-key"),
		).toBe(true);
	});

	test("exposes raw responses for negative compatibility assertions", async () => {
		const client = godexClient({ baseURL, apiKey: "test-key" });

		const res = await client.responses.createRaw({
			model: "missing/not-real",
			input: "Hello!",
		});

		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ id: "resp_client_test" });
	});
});
