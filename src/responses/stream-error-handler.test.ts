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

	test("records missing terminal trace error when downstream cancels an active stream", async () => {
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
			cancel: async () => {
				pendingRead.resolve({ done: true, value: undefined });
			},
			releaseLock: () => {},
		};
		const source = {
			getReader: () => fakeReader,
		} as unknown as ReadableStream<ResponseStreamEvent>;
		const machine = new ResponseStreamStateMachine({
			responseId: "resp_test",
			createdAt: 1,
			model: "test",
			provider: "mock",
		});
		machine.start();
		const traceRecords: unknown[] = [];
		const wrapped = wrapWithErrorHandler(
			source,
			machine,
			testContext({ traceEnabled: true, traceRecords }),
		);

		const reader = wrapped.getReader();
		await reader.read();
		await Promise.race([
			reader.cancel("downstream cancelled"),
			new Promise((resolve) => setTimeout(resolve, 20)),
		]);

		expect(traceRecords).toContainEqual(
			expect.objectContaining({
				kind: "error",
				event_name: "responses.stream.missing_terminal",
				code: "bridge.stream.missing_terminal",
				message: expect.stringContaining(
					"Response stream ended before a terminal event was emitted.",
				),
				payload: expect.objectContaining({
					payload: expect.objectContaining({
						cancel_reason: "downstream cancelled",
					}),
				}),
			}),
		);
	});
});

test("maps undefined cancel reason to client_disconnect", async () => {
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
		cancel: async () => {
			pendingRead.resolve({ done: true, value: undefined });
		},
		releaseLock: () => {},
	};
	const source = {
		getReader: () => fakeReader,
	} as unknown as ReadableStream<ResponseStreamEvent>;
	const machine = new ResponseStreamStateMachine({
		responseId: "resp_test",
		createdAt: 1,
		model: "test",
		provider: "mock",
	});
	machine.start();
	const traceRecords: unknown[] = [];
	const wrapped = wrapWithErrorHandler(
		source,
		machine,
		testContext({ traceEnabled: true, traceRecords }),
	);

	const reader = wrapped.getReader();
	await reader.read();
	await Promise.race([
		reader.cancel(),
		new Promise((resolve) => setTimeout(resolve, 20)),
	]);

	expect(traceRecords).toContainEqual(
		expect.objectContaining({
			kind: "error",
			event_name: "responses.stream.missing_terminal",
			code: "bridge.stream.missing_terminal",
			payload: expect.objectContaining({
				payload: expect.objectContaining({
					cancel_reason: "client_disconnect",
				}),
			}),
		}),
	);
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

function testContext(
	options: { traceEnabled?: boolean; traceRecords?: unknown[] } = {},
): ResponsesContext {
	return {
		app: {
			traceEnabled: options.traceEnabled ?? false,
			traceRecorder: {
				record: (event: unknown) => options.traceRecords?.push(event),
			},
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
