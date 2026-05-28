import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../../context/responses-context";
import { ADAPTER_RESPONSE_INVALID_OUTPUT_FORMAT } from "../../error";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";
import type { CompatibilityDiagnostic } from "../compatibility";
import type { CompatibilityPlan } from "../mapper/chat/compatibility-plan";
import {
	ensureOutputFormatContractSlot,
	OutputFormatContract,
} from "../mapper/chat/output-format-contract";
import { ResponseOutputContractValidationTransformer } from "./response-output-contract-validation-transformer";
import { pipeTransform } from "./stream-utils";

const degradedJsonSchemaPlan = {
	responseFormat: {
		action: "degraded",
		effectiveValue: { type: "json_object" },
	},
} as CompatibilityPlan;

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
		addDiagnostic(diagnostic: CompatibilityDiagnostic) {
			diagnostics.push(diagnostic);
		},
	} as unknown as ResponsesContext & {
		diagnostics: CompatibilityDiagnostic[];
	};
	ensureOutputFormatContractSlot(ctx).set(
		OutputFormatContract.fromRequestFormat(
			{
				type: "json_schema",
				name: "payload",
				schema: { type: "object" },
				strict: true,
			},
			degradedJsonSchemaPlan,
		),
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
						ADAPTER_RESPONSE_INVALID_OUTPUT_FORMAT,
					),
				},
			},
		});
		expect(ctx.diagnostics).toContainEqual(
			expect.objectContaining({
				code: ADAPTER_RESPONSE_INVALID_OUTPUT_FORMAT,
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
});
