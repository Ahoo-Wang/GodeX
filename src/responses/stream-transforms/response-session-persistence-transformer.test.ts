import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import type { Logger } from "../../logger";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai";
import type { ResponseSessionStore } from "../../session";
import { ResponseSessionPersistenceTransformer } from "./response-session-persistence-transformer";
import { pipeTransform } from "./stream-utils";

async function drain<T>(stream: ReadableStream<T>): Promise<T[]> {
	const reader = stream.getReader();
	const values: T[] = [];
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) return values;
			values.push(value);
		}
	} finally {
		reader.releaseLock();
	}
}

describe("ResponseSessionPersistenceTransformer", () => {
	test("logs stream session save failures with dot-only event names", async () => {
		const warnings: Array<{ event: string; attr?: Record<string, unknown> }> =
			[];
		const logger: Logger = {
			level: "warn",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: (event, attr) => {
				warnings.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			error: () => {},
		};
		const response: ResponseObject = {
			id: "resp_1",
			object: "response",
			created_at: 1,
			status: "completed",
			model: "glm-5.1",
			output: [],
		};
		const ctx = {
			requestId: "req_1",
			createdAt: 1,
			logger,
			attributes: new Map(),
			app: { sessionStore: {} as ResponseSessionStore },
		} as unknown as ResponsesContext;
		const event: ResponseStreamEvent = {
			type: "response.completed",
			response,
		};
		const stream = new ReadableStream<ResponseStreamEvent>({
			start(controller) {
				controller.enqueue(event);
				controller.close();
			},
		});

		await drain(
			pipeTransform(
				stream,
				new ResponseSessionPersistenceTransformer({
					ctx,
					async saveSession() {
						throw new Error("disk full");
					},
				}),
			),
		);

		expect(warnings).toContainEqual({
			event: "session.save.stream.error",
			attr: {
				request_id: "req_1",
				error: "Error: disk full",
			},
		});
	});
});
