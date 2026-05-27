import { describe, expect, test } from "bun:test";
import {
	SERVER_REQUEST_INVALID_JSON,
	SERVER_REQUEST_INVALID_PARAMETER,
} from "../../../error";
import { parseResponseRequest } from "./request-parser";
import {
	type CapturedLog,
	createCapturingLogger,
	jsonRequest,
	textRequest,
} from "./test-fixtures";

describe("parseResponseRequest", () => {
	test("returns invalid JSON response and logs parser failure", async () => {
		const logs: CapturedLog[] = [];

		const result = await parseResponseRequest(
			textRequest("{"),
			createCapturingLogger(logs),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const body = (await result.response.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe(SERVER_REQUEST_INVALID_JSON);
		expect(body.error.message).toBe("Invalid JSON body");
		expect(logs).toContainEqual(
			expect.objectContaining({
				level: "debug",
				event: "responses.request.invalid_json",
			}),
		);
	});

	test("rejects previous_response_id and conversation before context creation", async () => {
		const result = await parseResponseRequest(
			jsonRequest({
				model: "zhipu/glm-5.1",
				input: "hi",
				previous_response_id: "resp_1",
				conversation: { id: "conv_1" },
			}),
			createCapturingLogger([]),
		);

		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.response.status).toBe(400);
		const body = (await result.response.json()) as {
			error: { code: string; message: string };
		};
		expect(body.error.code).toBe("server.request.invalid_parameter");
		expect(body.error.message).toContain("previous_response_id");
		expect(body.error.message).toContain("conversation");
	});

	test("rejects non-object JSON bodies before context creation", async () => {
		for (const body of [null, [], "hi"]) {
			const result = await parseResponseRequest(
				jsonRequest(body),
				createCapturingLogger([]),
			);

			expect(result.ok).toBe(false);
			if (result.ok) return;
			expect(result.response.status).toBe(400);
			const errorBody = (await result.response.json()) as {
				error: { code: string; message: string };
			};
			expect(errorBody.error.code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
			expect(errorBody.error.message).toBe(
				"Request body must be a JSON object.",
			);
		}
	});

	test("returns parsed response request for valid JSON", async () => {
		const result = await parseResponseRequest(
			jsonRequest({
				model: "zhipu/glm-5.1",
				input: ["hi", "there"],
				stream: true,
			}),
			createCapturingLogger([]),
		);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.body as unknown).toEqual({
			model: "zhipu/glm-5.1",
			input: ["hi", "there"],
			stream: true,
		});
	});
});
