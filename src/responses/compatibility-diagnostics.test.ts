import { describe, expect, test } from "bun:test";
import type { ResponsesContext } from "../context/responses-context";
import {
	type CompatibilityDiagnostic,
	logDiagnostics,
} from "./compatibility-diagnostics";

function mockDiagnosticCtx(diagnostics: CompatibilityDiagnostic[]): {
	ctx: ResponsesContext;
	calls: Array<{ level: string; event: string; attr: Record<string, unknown> }>;
} {
	const calls: Array<{
		level: string;
		event: string;
		attr: Record<string, unknown>;
	}> = [];

	function log(level: string) {
		return (event: string, attr?: unknown) => {
			calls.push({
				level,
				event,
				attr:
					typeof attr === "function"
						? (attr as () => Record<string, unknown>)()
						: ((attr ?? {}) as Record<string, unknown>),
			});
		};
	}

	const ctx = {
		diagnostics,
		requestId: "req_test",
		responseId: "resp_test",
		logger: {
			level: "info",
			child: () => ctx.logger,
			trace: log("trace"),
			debug: log("debug"),
			info: log("info"),
			warn: log("warn"),
			error: log("error"),
		},
	} as unknown as ResponsesContext;

	return { ctx, calls };
}

describe("logDiagnostics", () => {
	test("does nothing when diagnostics array is empty", () => {
		const { ctx, calls } = mockDiagnosticCtx([]);
		logDiagnostics(ctx);
		expect(calls.length).toBe(0);
	});

	test("logs at info level when all diagnostics are info severity", () => {
		const { ctx, calls } = mockDiagnosticCtx([
			{
				code: "bridge.response.partial",
				severity: "info",
				action: "degraded",
				message: "Some fields not mapped",
			},
		]);

		logDiagnostics(ctx);

		expect(calls.length).toBe(1);
		expect(calls[0]?.level).toBe("info");
		expect(calls[0]?.event).toBe("responses.diagnostics");
		expect(calls[0]?.attr).toMatchObject({
			request_id: "req_test",
			response_id: "resp_test",
			count: 1,
		});
		const diagArray = calls[0]?.attr.diagnostics as CompatibilityDiagnostic[];
		expect(diagArray.length).toBe(1);
		expect(diagArray[0]?.code).toBe("bridge.response.partial");
	});

	test("logs at warn level when at least one diagnostic is warn", () => {
		const { ctx, calls } = mockDiagnosticCtx([
			{
				code: "bridge.response.partial",
				severity: "info",
				action: "degraded",
				message: "Some fields not mapped",
			},
			{
				code: "bridge.tool.unsupported",
				severity: "warn",
				action: "ignored",
				message: "Tool not supported",
			},
		]);

		logDiagnostics(ctx);

		expect(calls.length).toBe(1);
		expect(calls[0]?.level).toBe("warn");
		expect(calls[0]?.attr).toMatchObject({ count: 2 });
	});

	test("logs at error level when at least one diagnostic is error", () => {
		const { ctx, calls } = mockDiagnosticCtx([
			{
				code: "bridge.tool.unsupported",
				severity: "warn",
				action: "ignored",
				message: "Tool not supported",
			},
			{
				code: "bridge.input.rejected",
				severity: "error",
				action: "rejected",
				message: "Critical failure",
			},
		]);

		logDiagnostics(ctx);

		expect(calls.length).toBe(1);
		expect(calls[0]?.level).toBe("error");
		expect(calls[0]?.attr).toMatchObject({ count: 2 });
	});

	test("includes timing when provided", () => {
		const { ctx, calls } = mockDiagnosticCtx([
			{
				code: "bridge.param.unsupported",
				severity: "info",
				action: "ignored",
				message: "test",
			},
		]);

		logDiagnostics(ctx, { durationMillis: 1234 });

		expect(calls[0]?.attr).toMatchObject({ durationMillis: 1234 });
	});

	test("includes full diagnostic objects in output", () => {
		const diagnostic: CompatibilityDiagnostic = {
			code: "bridge.tool.unsupported",
			severity: "warn",
			path: "tools[0].type",
			action: "ignored",
			message: "Tool 'code_interpreter' is not supported",
			metadata: { toolType: "code_interpreter" },
		};
		const { ctx, calls } = mockDiagnosticCtx([diagnostic]);

		logDiagnostics(ctx);

		const diagArray = calls[0]?.attr.diagnostics as CompatibilityDiagnostic[];
		expect(diagArray[0]).toEqual(diagnostic);
	});
});
