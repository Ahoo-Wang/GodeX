import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../../../adapter/compatibility";
import type { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import { AdapterError } from "../../../error";
import { createLogger } from "../../../logger";
import type { ResponseCreateRequest } from "../../../protocol/openai/responses";
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

describe("DeepSeek request mapping", () => {
	test("disables thinking when reasoning is absent", () => {
		const result = mapRequest(ctx());
		expect(result.thinking).toEqual({ type: "disabled" });
		expect(result.reasoning_effort).toBeUndefined();
	});

	test("maps reasoning high-compatible efforts to DeepSeek high", () => {
		for (const effort of ["minimal", "low", "medium", "high"] as const) {
			const result = mapRequest(ctx({ reasoning: { effort } }));
			expect(result.thinking).toEqual({ type: "enabled" });
			expect(result.reasoning_effort).toBe("high");
		}
	});

	test("maps reasoning xhigh to DeepSeek max", () => {
		const result = mapRequest(ctx({ reasoning: { effort: "xhigh" } }));
		expect(result.thinking).toEqual({ type: "enabled" });
		expect(result.reasoning_effort).toBe("max");
	});

	test("omits temperature and top_p in thinking mode with diagnostics", () => {
		const c = ctx({
			reasoning: { effort: "high" },
			temperature: 0.2,
			top_p: 0.8,
		});
		const result = mapRequest(c);
		expect(result.temperature).toBeUndefined();
		expect(result.top_p).toBeUndefined();
		expect(c.diagnostics.map((d) => d.path)).toContain("temperature");
		expect(c.diagnostics.map((d) => d.path)).toContain("top_p");
	});

	test("passes sampling in non-thinking mode", () => {
		const result = mapRequest(ctx({ temperature: 0.2, top_p: 0.8 }));
		expect(result.temperature).toBe(0.2);
		expect(result.top_p).toBe(0.8);
	});

	test("maps max tokens, streaming, user id, and json object", () => {
		const result = mapRequest(
			ctx({
				stream: true,
				max_output_tokens: 1024,
				safety_identifier: "safe-user",
				text: { format: { type: "json_object" } },
			}),
		);
		expect(result.stream).toBe(true);
		expect(result.stream_options).toEqual({ include_usage: true });
		expect(result.max_tokens).toBe(1024);
		expect(result.user_id).toBe("safe-user");
		expect(result.response_format).toEqual({ type: "json_object" });
	});

	test("degrades json_schema to json_object with diagnostic", () => {
		const c = ctx({
			text: {
				format: {
					type: "json_schema",
					name: "person",
					schema: { type: "object" },
				},
			},
		});
		const result = mapRequest(c);
		expect(result.response_format).toEqual({ type: "json_object" });
		expect(c.diagnostics.some((d) => d.path === "text.format")).toBe(true);
	});

	test("rejects unsupported hard parameters", () => {
		expect(() => mapRequest(ctx({ background: true }))).toThrow(AdapterError);
		expect(() => mapRequest(ctx({ conversation: "conv_1" }))).toThrow(
			AdapterError,
		);
		expect(() => mapRequest(ctx({ prompt: { id: "pmpt_1" } }))).toThrow(
			AdapterError,
		);
	});

	test("warns and ignores unsupported soft parameters", () => {
		const c = ctx({
			truncation: "auto",
			parallel_tool_calls: true,
			metadata: { trace: "x" },
			prompt_cache_key: "cache-key",
			prompt_cache_retention: "24h",
			text: { verbosity: "low" },
		});
		const result = mapRequest(c);
		expect(result).not.toHaveProperty("parallel_tool_calls");
		expect(result).not.toHaveProperty("prompt_cache_key");
		expect(c.diagnostics.map((d) => d.path)).toEqual(
			expect.arrayContaining([
				"truncation",
				"parallel_tool_calls",
				"metadata",
				"prompt_cache_key",
				"prompt_cache_retention",
				"text.verbosity",
			]),
		);
	});
});
