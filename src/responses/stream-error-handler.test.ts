import { describe, expect, test } from "bun:test";
import { ResponseStreamStateMachine } from "../bridge/stream";
import type { ResponsesContext } from "../context/responses-context";
import type { ResponseStreamEvent } from "../protocol/openai/responses";
import { wrapWithErrorHandler } from "./stream-error-handler";

describe("wrapWithErrorHandler", () => {
	test("cancels and releases the upstream reader when downstream cancels", async () => {
		let cancelCount = 0;
		let releaseCount = 0;
		let cancelReason: unknown;
		const pendingRead = deferred<StreamReadResult<ResponseStreamEvent>>();
		const fakeReader = {
			read: (() => {
				let reads = 0;
				return () => {
					reads += 1;
					if (reads === 1) {
						return Promise.resolve({
							done: false as const,
							value: responseCreatedEvent(),
						});
					}
					return pendingRead.promise;
				};
			})(),
			cancel: async (reason?: unknown) => {
				cancelCount += 1;
				cancelReason = reason;
				pendingRead.resolve({ done: true, value: undefined });
			},
			releaseLock: () => {
				releaseCount += 1;
			},
		};
		const source = {
			getReader: () => fakeReader,
		} as unknown as ReadableStream<ResponseStreamEvent>;
		const wrapped = wrapWithErrorHandler(
			source,
			new ResponseStreamStateMachine({
				responseId: "resp_test",
				createdAt: 1,
				model: "test",
				provider: "mock",
			}),
			testContext(),
		);

		const reader = wrapped.getReader();
		expect(await reader.read()).toEqual({
			done: false,
			value: responseCreatedEvent(),
		});
		await Promise.race([
			reader.cancel("downstream cancelled"),
			new Promise((resolve) => setTimeout(resolve, 20)),
		]);

		expect(cancelCount).toBe(1);
		expect(cancelReason).toBe("downstream cancelled");
		expect(releaseCount).toBe(1);
	});
});

function responseCreatedEvent(): ResponseStreamEvent {
	return {
		type: "response.created",
		response: {
			id: "resp_test",
			object: "response",
			created_at: 1,
			status: "queued",
			model: "test",
			output: [],
			output_text: "",
			usage: null,
			error: null,
			incomplete_details: null,
		},
	};
}

function testContext(): ResponsesContext {
	return {
		app: {
			traceEnabled: false,
			traceRecorder: { record: () => {} },
		},
		requestId: "req_test",
		responseId: "resp_test",
		resolved: { provider: "mock", model: "test" },
		logger: {
			debug: () => {},
			warn: () => {},
		},
	} as unknown as ResponsesContext;
}

function deferred<T>(): {
	readonly promise: Promise<T>;
	resolve(value: T): void;
} {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((innerResolve) => {
		resolve = innerResolve;
	});
	return { promise, resolve };
}

type StreamReadResult<T> = Awaited<
	ReturnType<ReturnType<ReadableStream<T>["getReader"]>["read"]>
>;
