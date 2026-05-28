import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { AdapterError } from "../../../error";
import { createLogger } from "../../../logger";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
import { describeUnsupportedToolCompatibility } from "../../shared/compatibility-test-suite";
import type { ChatCompletionRequest } from "../protocol/completions";
import { createDeepSeekMapper } from "./index";

function ctx(partial: Partial<ResponseCreateRequest> = {}): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: {
			model: "deepseek-v4-flash",
			input: "Hello",
			...partial,
		} as ResponseCreateRequest,
		resolved: { provider: "deepseek", model: "deepseek-v4-flash" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as ApplicationContext,
		provider: { name: "deepseek", mapper: {} as never, client: {} as never },
		diagnostics,
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
	} as unknown as ResponsesContext;
}

const mapRequest = (c: ResponsesContext): ChatCompletionRequest =>
	createDeepSeekMapper().request.map(c) as ChatCompletionRequest;
const mapCompatibilityRequest = (partial: Partial<ResponseCreateRequest>) => {
	const c = ctx(partial);
	return { request: mapRequest(c), diagnostics: c.diagnostics };
};

describeUnsupportedToolCompatibility<ChatCompletionRequest>({
	provider: "DeepSeek",
	mapRequest: mapCompatibilityRequest,
	unsupportedTool: {
		type: "code_interpreter",
		container: { type: "auto" },
	},
	expectNoProviderTools(request) {
		expect(request.tools).toBeUndefined();
	},
});

describe("DeepSeek tools", () => {
	test("maps function tools and preserves strict mode", () => {
		const result = mapRequest(
			ctx({
				tools: [
					{
						type: "function",
						name: "get_weather",
						description: "Get weather",
						strict: true,
						parameters: {
							type: "object",
							properties: { city: { type: "string" } },
							required: ["city"],
						},
					},
				],
			}),
		);

		expect(result.tools).toEqual([
			{
				type: "function",
				function: {
					name: "get_weather",
					description: "Get weather",
					strict: true,
					parameters: {
						type: "object",
						properties: { city: { type: "string" } },
						required: ["city"],
					},
				},
			},
		]);
	});

	test("downgrades Codex tools to DeepSeek function tools", () => {
		const result = mapRequest(
			ctx({
				tools: [
					{ type: "local_shell" },
					{ type: "apply_patch" },
					{
						type: "custom",
						name: "read.file",
						description: "Read file contents",
					},
					{
						type: "namespace",
						name: "workspace",
						description: "Workspace tools",
						tools: [
							{
								type: "function",
								name: "list-files",
								description: "List files",
								parameters: { type: "object" },
								strict: false,
							},
						],
					},
				],
			}),
		);

		expect(result.tools?.map((tool) => tool.function.name)).toEqual([
			"local_shell",
			"apply_patch",
			"read_file",
			"workspace__list-files",
		]);
		expect(result.tools?.[3]?.function.strict).toBe(false);
	});

	test("skips unsupported native tools with diagnostics", () => {
		const c = ctx({
			tools: [
				{
					type: "web_search_preview",
					search_context_size: "low",
				},
			],
		});

		const result = mapRequest(c);

		expect(result.tools).toBeUndefined();
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.tool.unsupported",
				path: "tools[type=web_search_preview]",
				action: "ignored",
			}),
		);
	});

	test("disables tools when tool_choice is none", () => {
		const result = mapRequest(
			ctx({
				tool_choice: "none",
				tools: [
					{
						type: "function",
						name: "get_weather",
						strict: true,
						parameters: { type: "object" },
					},
				],
			}),
		);

		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
	});

	test("maps non-thinking tool choices", () => {
		const auto = mapRequest(
			ctx({
				tool_choice: "auto",
				tools: [
					{
						type: "function",
						name: "get_weather",
						strict: true,
						parameters: { type: "object" },
					},
				],
			}),
		);
		const required = mapRequest(
			ctx({
				tool_choice: "required",
				tools: [
					{
						type: "function",
						name: "get_weather",
						strict: true,
						parameters: { type: "object" },
					},
				],
			}),
		);
		const named = mapRequest(
			ctx({
				tool_choice: { type: "function", name: "weather.now" },
				tools: [
					{
						type: "function",
						name: "weather.now",
						strict: true,
						parameters: { type: "object" },
					},
				],
			}),
		);

		expect(auto.tool_choice).toBe("auto");
		expect(required.tool_choice).toBe("required");
		expect(named.tool_choice).toEqual({
			type: "function",
			function: { name: "weather_now" },
		});
	});

	test("degrades unsupported non-thinking tool choices to auto", () => {
		const c = ctx({
			tool_choice: { type: "custom", name: "read.file" },
			tools: [{ type: "custom", name: "read.file" }],
		});

		const result = mapRequest(c);

		expect(result.tool_choice).toBe("auto");
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				path: "tool_choice",
				action: "degraded",
			}),
		);
	});

	test("omits tool_choice in thinking mode while keeping tools", () => {
		const c = ctx({
			reasoning: { effort: "high" },
			tool_choice: "required",
			tools: [
				{
					type: "function",
					name: "get_weather",
					strict: true,
					parameters: { type: "object" },
				},
			],
		});

		const result = mapRequest(c);

		expect(result.tools).toHaveLength(1);
		expect(result.tool_choice).toBeUndefined();
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				path: "tool_choice",
				action: "ignored",
			}),
		);
	});

	test("rejects function name collisions after sanitization", () => {
		expect(() =>
			mapRequest(
				ctx({
					tools: [
						{ type: "custom", name: "read.file" },
						{ type: "custom", name: "read_file" },
					],
				}),
			),
		).toThrow(AdapterError);
	});

	test("rejects mapped tool lists beyond DeepSeek capacity", () => {
		expect(() =>
			mapRequest(
				ctx({
					tools: Array.from({ length: 129 }, (_, index) => ({
						type: "custom" as const,
						name: `tool_${index}`,
					})),
				}),
			),
		).toThrow(AdapterError);
	});
});
