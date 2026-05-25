// src/providers/openai/request.test.ts
import { describe, expect, test } from "bun:test";
import type { ApplicationContext } from "../../context/application-context";
import type { ResponsesContext } from "../../context/responses-context";
import { createLogger } from "../../logger";
import { buildOpenAIRequest } from "./request";

function ctx(partial: Record<string, unknown> = {}): ResponsesContext {
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
	} as unknown as ResponsesContext;
}

describe("buildOpenAIRequest", () => {
	test("converts basic text request", () => {
		const result = buildOpenAIRequest(ctx({ input: "Hello" }));

		expect(result.model).toBe("gpt-4o");
		expect(result.messages).toEqual([{ role: "user", content: "Hello" }]);
		expect(result.stream).toBeUndefined();
	});

	test("maps instructions to developer message", () => {
		const result = buildOpenAIRequest(
			ctx({ input: "Hi", instructions: "Be helpful." }),
		);

		expect(result.messages[0]).toEqual({
			role: "developer",
			content: "Be helpful.",
		});
		expect(result.messages[1]).toEqual({ role: "user", content: "Hi" });
	});

	test("passes through temperature", () => {
		const result = buildOpenAIRequest(ctx({ input: "Hi", temperature: 0.7 }));

		expect(result.temperature).toBe(0.7);
	});

	test("maps max_output_tokens to max_completion_tokens", () => {
		const result = buildOpenAIRequest(
			ctx({ input: "Hi", max_output_tokens: 4096 }),
		);

		expect(result.max_completion_tokens).toBe(4096);
		expect("max_tokens" in (result as unknown as Record<string, unknown>)).toBe(
			false,
		);
	});

	test("maps reasoning effort", () => {
		const result = buildOpenAIRequest(
			ctx({ input: "Hi", reasoning: { effort: "high" } }),
		);

		expect(result.reasoning_effort).toBe("high");
	});

	test('does not map reasoning effort "none"', () => {
		const result = buildOpenAIRequest(
			ctx({ input: "Hi", reasoning: { effort: "none" } }),
		);

		expect(result.reasoning_effort).toBeUndefined();
	});

	test("passes through response_format json_schema", () => {
		const schema = {
			type: "object",
			properties: { name: { type: "string" } },
		};
		const result = buildOpenAIRequest(
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
		const result = buildOpenAIRequest(ctx({ input: "Hi", user: "user-123" }));

		expect(result.user).toBe("user-123");
	});

	test("passes through Codex request metadata supported by Chat Completions", () => {
		const result = buildOpenAIRequest(
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
		const result = buildOpenAIRequest(
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
		const result = buildOpenAIRequest(
			ctx({
				input: "Hi",
				tools: [
					{
						type: "web_search",
						search_context_size: "high",
					},
				],
			}),
		);

		expect(result.web_search_options).toEqual({
			search_context_size: "high",
		});
		expect(result.tools).toBeUndefined();
	});

	test("sets stream flag with stream_options.include_usage", () => {
		const result = buildOpenAIRequest(ctx({ input: "Hi", stream: true }));

		expect(result.stream).toBe(true);
		expect(result.stream_options).toEqual({ include_usage: true });
	});

	test("passes through parallel_tool_calls", () => {
		const result = buildOpenAIRequest(
			ctx({ input: "Hi", parallel_tool_calls: false }),
		);

		expect(result.parallel_tool_calls).toBe(false);
	});

	test("passes through metadata, store, and service_tier", () => {
		const result = buildOpenAIRequest(
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
