import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../bridge/compatibility";
import { planOutputContract } from "../../bridge/output";
import { OutputContractSlot } from "../../context/output-contract-slot";
import type { ResponsesContext } from "../../context/responses-context";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT } from "../../error";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import { ResponseOutputContractValidationTransformer } from "./response-output-contract-validation-transformer";
import { pipeTransform } from "./stream-utils";

const degradedJsonSchemaPlan = {
	responseFormat: {
		action: "degraded",
		effectiveValue: { type: "json_object" },
	},
} as const;

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

function createContext(): ResponsesContext & {
	diagnostics: CompatibilityDiagnostic[];
} {
	const diagnostics: CompatibilityDiagnostic[] = [];
	const ctx = {
		resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
		diagnostics,
		outputContract: new OutputContractSlot(),
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			diagnostics.push(diagnostic);
		},
	} as unknown as ResponsesContext & {
		diagnostics: CompatibilityDiagnostic[];
	};
	ctx.outputContract.set(
		planOutputContract({
			format: {
				type: "json_schema",
				name: "payload",
				schema: { type: "object" },
				strict: true,
			},
			responseFormatDecision: degradedJsonSchemaPlan.responseFormat,
		}),
	);
	return ctx;
}

function response(outputText: string): ResponseObject {
	return {
		id: "resp_stream_validation",
		object: "response",
		created_at: 1,
		status: "completed",
		model: "deepseek-v4-flash",
		output: [
			{
				id: "msg_1",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: outputText }],
			},
		],
		output_text: outputText,
	};
}

function streamFrom(
	events: ResponseStreamEvent[],
): ReadableStream<ResponseStreamEvent> {
	return new ReadableStream({
		start(controller) {
			for (const event of events) controller.enqueue(event);
			controller.close();
		},
	});
}

describe("ResponseOutputContractValidationTransformer", () => {
	test("rewrites invalid strict downgraded JSON terminal responses to failed events", async () => {
		const ctx = createContext();
		const events = await drain(
			pipeTransform(
				streamFrom([
					{ type: "response.completed", response: response("not json") },
				]),
				new ResponseOutputContractValidationTransformer(ctx),
			),
		);

		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			type: "response.failed",
			response: {
				status: "failed",
				error: {
					code: "server_error",
					message: expect.stringContaining(
						BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
					),
				},
			},
		});
		expect(ctx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
				path: "response.output_text",
				action: "rejected",
			}),
		);
	});

	test("passes valid terminal responses through unchanged", async () => {
		const ctx = createContext();
		const completed: ResponseStreamEvent = {
			type: "response.completed",
			response: response('{"ok":true}'),
		};

		const events = await drain(
			pipeTransform(
				streamFrom([completed]),
				new ResponseOutputContractValidationTransformer(ctx),
			),
		);

		expect(events).toEqual([completed]);
		expect(ctx.diagnostics).toEqual([]);
	});

	test("passes incomplete terminal responses through unchanged", async () => {
		const ctx = createContext();
		const incomplete: ResponseStreamEvent = {
			type: "response.incomplete",
			response: {
				...response(""),
				status: "incomplete",
				incomplete_details: { reason: "max_output_tokens" },
			},
		};

		const events = await drain(
			pipeTransform(
				streamFrom([incomplete]),
				new ResponseOutputContractValidationTransformer(ctx),
			),
		);

		expect(events).toEqual([incomplete]);
		expect(ctx.diagnostics).toEqual([]);
	});
});
