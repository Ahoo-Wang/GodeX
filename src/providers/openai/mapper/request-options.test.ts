import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { createLogger } from "../../../logger";
import type { ChatCompletionCreateRequest } from "../../../protocol/openai/completions";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
import { describeUnsupportedToolCompatibility } from "../../shared/compatibility-test-suite";
import { createOpenAIMapper } from "./index";

function ctx(partial: Partial<ResponseCreateRequest> = {}): ResponsesContext {
	const diagnostics: CompatibilityDiagnostic[] = [];
	return {
		request: {
			model: "gpt-4o",
			...partial,
		} as unknown as ResponsesContext["request"],
		resolved: { provider: "openai", model: "gpt-4o" },
		session: null,
		responseId: "resp_1",
		requestId: "req_1",
		createdAt: 1_764_000_000,
		logger: createLogger({ level: "error" }),
		app: {} as unknown as ApplicationContext,
		provider: {
			name: "openai",
			mapper: {} as never,
			client: {} as never,
		},
		diagnostics,
		addDiagnostic(d: CompatibilityDiagnostic) {
			diagnostics.push(d);
		},
		attributes: new Map(),
	} as unknown as ResponsesContext;
}

const mapper = createOpenAIMapper();
const mapRequest = (c: ResponsesContext): ChatCompletionCreateRequest =>
	mapper.request.map(c) as ChatCompletionCreateRequest;
const mapCompatibilityRequest = (partial: Partial<ResponseCreateRequest>) => {
	const c = ctx(partial);
	return { request: mapRequest(c), diagnostics: c.diagnostics };
};

describeUnsupportedToolCompatibility<ChatCompletionCreateRequest>({
	provider: "OpenAI",
	mapRequest: mapCompatibilityRequest,
	unsupportedTool: {
		type: "code_interpreter",
		container: { type: "auto" },
	},
	expectNoProviderTools(request) {
		expect(request.tools).toBeUndefined();
	},
});

describe("buildOpenAIRequest", () => {
	test("converts basic text request", () => {
		const result = mapRequest(ctx({ input: "Hello" }));

		expect(result.model).toBe("gpt-4o");
		expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
		expect(result.stream).toBeUndefined();
	});

	test("maps instructions to developer message", () => {
		const result = mapRequest(
			ctx({ input: "Hi", instructions: "Be helpful." }),
		);

		expect(result.messages[0]).toEqual({
			role: "developer",
			content: "Be helpful.",
		});
		expect(result.messages[1]).toEqual({ role: "user", content: "Hi" });
	});

	test("passes through temperature", () => {
		const result = mapRequest(ctx({ input: "Hi", temperature: 0.7 }));

		expect(result.temperature).toBe(0.7);
	});

	test("maps max_output_tokens to max_completion_tokens", () => {
		const result = mapRequest(ctx({ input: "Hi", max_output_tokens: 4096 }));

		expect(result.max_completion_tokens).toBe(4096);
		expect("max_tokens" in (result as unknown as Record<string, unknown>)).toBe(
			false,
		);
	});

	test("maps reasoning effort", () => {
		const result = mapRequest(
			ctx({ input: "Hi", reasoning: { effort: "high" } }),
		);

		expect(result.reasoning_effort).toBe("high");
	});

	test('does not map reasoning effort "none"', () => {
		const result = mapRequest(
			ctx({ input: "Hi", reasoning: { effort: "none" } }),
		);

		expect(result.reasoning_effort).toBeUndefined();
	});

	test("passes through response_format json_schema", () => {
		const schema = {
			type: "object",
			properties: { name: { type: "string" } },
		};
		const result = mapRequest(
			ctx({
				input: "Hi",
				text: {
					format: {
						type: "json_schema",
						name: "person",
						schema,
						strict: true,
					},
				},
			}),
		);

		expect(result.response_format).toEqual({
			type: "json_schema",
			json_schema: {
				name: "person",
				schema,
				strict: true,
			},
		});
	});

	test("passes through user field", () => {
		const result = mapRequest(ctx({ input: "Hi", user: "user-123" }));

		expect(result.user).toBe("user-123");
	});

	test("passes through Codex request metadata supported by Chat Completions", () => {
		const result = mapRequest(
			ctx({
				input: "Hi",
				prompt_cache_key: "cache-key-1",
				prompt_cache_retention: "24h",
				safety_identifier: "safe-user-1",
				text: { verbosity: "low" },
			}),
		);

		expect(result.prompt_cache_key).toBe("cache-key-1");
		expect(result.prompt_cache_retention).toBe("24h");
		expect(result.safety_identifier).toBe("safe-user-1");
		expect(result.verbosity).toBe("low");
	});

	test("maps tools and tool_choice", () => {
		const result = mapRequest(
			ctx({
				input: "Hi",
				tools: [
					{
						type: "function",
						name: "get_weather",
						parameters: { type: "object" },
						strict: true,
					},
				],
				tool_choice: "auto",
			}),
		);

		expect(result.tools).toHaveLength(1);
		expect(result.tools?.[0]).toEqual({
			type: "function",
			function: {
				name: "get_weather",
				parameters: { type: "object" },
				strict: true,
			},
		});
		expect(result.tool_choice).toBe("auto");
	});

	test("maps web_search tool to web_search_options", () => {
		const c = ctx({
			input: "Hi",
			tools: [
				{
					type: "web_search",
					search_context_size: "high",
				},
			],
		});
		const result = mapRequest(c);

		expect(result.web_search_options).toEqual({
			search_context_size: "high",
		});
		expect(result.tools).toBeUndefined();
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.tool.degraded",
				severity: "warn",
				path: "tools[type=web_search]",
				action: "degraded",
			}),
		);
	});

	test("uses the actual web_search variant in degradation diagnostics", () => {
		const c = ctx({
			input: "Hi",
			tools: [
				{
					type: "web_search_preview_2025_03_11",
					search_context_size: "medium",
				},
			],
		});

		const result = mapRequest(c);

		expect(result.web_search_options).toEqual({
			search_context_size: "medium",
		});
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.tool.degraded",
				path: "tools[type=web_search_preview_2025_03_11]",
				message: expect.stringContaining("web_search_preview_2025_03_11"),
				metadata: { toolType: "web_search_preview_2025_03_11" },
			}),
		);
	});

	test('omits web_search_options when tool_choice "none" disables tools', () => {
		const result = mapRequest(
			ctx({
				input: "Hi",
				tool_choice: "none",
				tools: [
					{
						type: "web_search",
						search_context_size: "high",
					},
				],
			}),
		);

		expect(result.web_search_options).toBeUndefined();
		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
	});

	test("omits unsupported tool_choice when only web_search sidecar remains", () => {
		const c = ctx({
			input: "Hi",
			tool_choice: "required",
			tools: [
				{
					type: "web_search",
					search_context_size: "high",
				},
			],
		});

		const result = mapRequest(c);

		expect(result.web_search_options).toEqual({
			search_context_size: "high",
		});
		expect(result.tools).toBeUndefined();
		expect(result.tool_choice).toBeUndefined();
		expect(c.diagnostics).toContainEqual(
			expect.objectContaining({
				code: "adapter.param.unsupported",
				severity: "warn",
				path: "tool_choice",
				action: "ignored",
			}),
		);
	});

	test("maps OpenAI tools once while applying tool sidecar options", () => {
		let typeReads = 0;
		const tool = new Proxy(
			{
				type: "web_search",
				search_context_size: "high",
			} as const,
			{
				get(target, property, receiver) {
					if (property === "type") typeReads += 1;
					return Reflect.get(target, property, receiver);
				},
			},
		);

		const result = mapRequest(ctx({ input: "Hi", tools: [tool] }));

		expect(result.web_search_options).toEqual({
			search_context_size: "high",
		});
		expect(typeReads).toBe(1);
	});

	test("sets stream flag with stream_options.include_usage", () => {
		const result = mapRequest(ctx({ input: "Hi", stream: true }));

		expect(result.stream).toBe(true);
		expect(result.stream_options).toEqual({ include_usage: true });
	});

	test("passes through parallel_tool_calls", () => {
		const result = mapRequest(ctx({ input: "Hi", parallel_tool_calls: false }));

		expect(result.parallel_tool_calls).toBe(false);
	});

	test("passes through metadata, store, and service_tier", () => {
		const result = mapRequest(
			ctx({
				input: "Hi",
				metadata: { tenant: "test" },
				store: true,
				service_tier: "default",
			}),
		);

		expect(result.metadata).toEqual({ tenant: "test" });
		expect(result.store).toBe(true);
		expect(result.service_tier).toBe("default");
	});
});
