import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../adapter/compatibility";
import type {
	ResponseCreateRequest,
	ResponseTool,
} from "../../protocol/openai/responses";

export interface CompatibilitySuiteResult<TRequest> {
	request: TRequest;
	diagnostics: CompatibilityDiagnostic[];
}

export interface CurrentInputContentCompatibilityOptions<TRequest> {
	provider: string;
	mapRequest(
		request: Partial<ResponseCreateRequest>,
	): CompatibilitySuiteResult<TRequest>;
	getUserMessageContent(request: TRequest): unknown;
}

export interface UnsupportedToolCompatibilityOptions<TRequest> {
	provider: string;
	mapRequest(
		request: Partial<ResponseCreateRequest>,
	): CompatibilitySuiteResult<TRequest>;
	unsupportedTool: ResponseTool;
	expectNoProviderTools(request: TRequest): void;
}

export function describeCurrentInputContentCompatibility<TRequest>(
	options: CurrentInputContentCompatibilityOptions<TRequest>,
): void {
	describe(`${options.provider} current input content compatibility`, () => {
		test("keeps supported text and records diagnostics for unsupported content", () => {
			const result = options.mapRequest({
				input: [
					{
						role: "user",
						content: [
							{
								type: "input_image",
								image_url: "https://example.com/cat.png",
							},
							{
								type: "input_text",
								text: "Hello",
							},
						],
					},
				],
			});

			expect(options.getUserMessageContent(result.request)).toBe("Hello");
			expect(result.diagnostics).toContainEqual(
				expect.objectContaining({
					code: "adapter.input.unsupported_content",
					severity: "warn",
					path: "input[0].content[0]",
					action: "ignored",
				}),
			);
		});
	});
}

export function describeUnsupportedToolCompatibility<TRequest>(
	options: UnsupportedToolCompatibilityOptions<TRequest>,
): void {
	describe(`${options.provider} unsupported tool compatibility`, () => {
		test("skips unsupported tools with diagnostics instead of rejecting", () => {
			const result = options.mapRequest({
				input: "Hello",
				tools: [options.unsupportedTool],
			});

			options.expectNoProviderTools(result.request);
			expect(result.diagnostics).toContainEqual(
				expect.objectContaining({
					code: "adapter.tool.unsupported",
					severity: "warn",
					path: `tools[type=${options.unsupportedTool.type}]`,
					action: "ignored",
				}),
			);
		});
	});
}
