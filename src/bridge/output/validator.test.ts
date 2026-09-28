import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT, GodeXError } from "../../error";
import type { ResponseObject } from "../../protocol/openai/responses";
import { validateResponseOutputContract } from "./validator";

function response(
	outputText: string,
	outputTextField = outputText,
): ResponseObject {
	return {
		id: "resp_test",
		object: "response",
		created_at: 1,
		status: "completed",
		model: "test-model",
		output: [
			{
				id: "msg_test",
				type: "message",
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: outputText }],
			},
		],
		output_text: outputTextField,
	};
}

function bridgeOutputFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((entry) => {
		const path = join(dir, entry);
		const stat = statSync(path);
		if (stat.isDirectory()) return bridgeOutputFiles(path);
		return path.endsWith(".ts") ? [path] : [];
	});
}

describe("validateResponseOutputContract", () => {
	test("rejects invalid response output JSON when validation is required", () => {
		expect(() =>
			validateResponseOutputContract({
				requiresValidJson: true,
				response: response("not json"),
				provider: "deepseek",
				model: "deepseek-v4-flash",
			}),
		).toThrow(GodeXError);

		try {
			validateResponseOutputContract({
				requiresValidJson: true,
				response: response("not json"),
				provider: "deepseek",
				model: "deepseek-v4-flash",
			});
			throw new Error("expected validation to fail");
		} catch (err) {
			expect(err).toBeInstanceOf(GodeXError);
			expect((err as GodeXError).code).toBe(
				BRIDGE_RESPONSE_INVALID_OUTPUT_FORMAT,
			);
		}
	});

	test("accepts valid response output JSON when validation is required", () => {
		expect(() =>
			validateResponseOutputContract({
				requiresValidJson: true,
				response: response('{"ok":true}'),
				provider: "deepseek",
				model: "deepseek-v4-flash",
			}),
		).not.toThrow();
	});

	test("does not validate response output when valid JSON is not required", () => {
		expect(() =>
			validateResponseOutputContract({
				requiresValidJson: false,
				response: response("not json"),
				provider: "deepseek",
				model: "deepseek-v4-flash",
			}),
		).not.toThrow();
	});

	test("falls back to assistant output item text when output_text is absent", () => {
		const responseWithoutOutputText = response(
			'{"ok":true}',
			undefined as never,
		);
		delete (responseWithoutOutputText as { output_text?: string }).output_text;

		expect(() =>
			validateResponseOutputContract({
				requiresValidJson: true,
				response: responseWithoutOutputText,
				provider: "deepseek",
				model: "deepseek-v4-flash",
			}),
		).not.toThrow();
	});

	test("bridge output files do not import responses runtime modules", () => {
		const dir = fileURLToPath(new URL(".", import.meta.url));
		const offenders = bridgeOutputFiles(dir).filter((path) => {
			const importLines = readFileSync(path, "utf8")
				.split("\n")
				.filter((line) => /^\s*(import|export)\b/.test(line))
				.join("\n");
			return (
				importLines.includes('"../../responses') ||
				importLines.includes("'../../responses")
			);
		});

		expect(offenders).toEqual([]);
	});
});
