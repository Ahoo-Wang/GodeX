import { describe, expect, test } from "bun:test";
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
import { ResponseSseEncoder } from "./response-sse-encoder";
import { pipeTransform } from "./stream-utils";

async function readText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let text = "";
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return text;
			text += decoder.decode(value, { stream: true });
		}
	} finally {
		reader.releaseLock();
	}
}

function dataPayloads(text: string): Array<Record<string, unknown>> {
	return text
		.split("\n")
		.filter((line) => line.startsWith("data: "))
		.map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

describe("ResponseSseEncoder", () => {
	test("encodes response stream events as SSE frames", async () => {
		const event: ResponseStreamEvent = {
			type: "response.created",
			response: {
				id: "resp_1",
				object: "response",
				created_at: 1,
				status: "in_progress",
				model: "test",
				output: [],
			},
		};
		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(event);
				controller.close();
			},
		});

		const text = await readText(
			pipeTransform(stream, new ResponseSseEncoder()),
		);

		expect(text).toContain("event: response.created\n");
		expect(text).toContain('"id":"resp_1"');
	});

	test("preserves sequence_number already present on stream events", async () => {
		const event: ResponseStreamEvent = {
			type: "response.created",
			sequence_number: 42,
			response: {
				id: "resp_1",
				object: "response",
				created_at: 1,
				status: "in_progress",
				model: "test",
				output: [],
			},
		};
		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(event);
				controller.close();
			},
		});

		const text = await readText(
			pipeTransform(stream, new ResponseSseEncoder()),
		);

		expect(text).toContain('"sequence_number":42');
		expect(text).not.toContain('"sequence_number":0');
	});

	test("continues automatic sequence after an explicit sequence_number", async () => {
		const response = {
			id: "resp_1",
			object: "response" as const,
			created_at: 1,
			status: "in_progress" as const,
			model: "test",
			output: [],
		};
		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue({
					type: "response.created",
					sequence_number: 42,
					response,
				});
				controller.enqueue({ type: "response.in_progress", response });
				controller.close();
			},
		});

		const text = await readText(
			pipeTransform(stream, new ResponseSseEncoder()),
		);

		expect(dataPayloads(text).map((event) => event.sequence_number)).toEqual([
			42, 43,
		]);
	});
});
