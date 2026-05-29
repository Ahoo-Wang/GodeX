import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../bridge/compatibility";
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ResponseSessionSnapshot } from "../session";
import { createTestProviderEdge } from "../testing/provider-edge";
import type { ApplicationContext } from "./application-context";
import { ResponsesContext } from "./responses-context";

const logger: Logger = {
	level: "info",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const provider = createTestProviderEdge({ name: "mock" });

function createContext(
	overrides: Partial<ConstructorParameters<typeof ResponsesContext>[0]> = {},
): ResponsesContext {
	return new ResponsesContext({
		app: {} as ApplicationContext,
		request: { model: "zhipu/glm-5.1", input: "hi" } as ResponseCreateRequest,
		session: null as ResponseSessionSnapshot | null,
		resolved: { provider: "zhipu", model: "glm-5.1" } as ResolvedModel,
		provider,
		requestId: "req_test",
		responseId: "resp_test",
		createdAt: 123,
		logger,
		...overrides,
	});
}

describe("ResponsesContext", () => {
	test("stores request-scoped dependencies from init object", () => {
		const request = {
			model: "zhipu/glm-5.1",
			input: "hello",
		} as ResponseCreateRequest;
		const resolved = { provider: "zhipu", model: "glm-5.1" };

		const ctx = createContext({ request, resolved });

		expect(ctx.app).toBeDefined();
		expect(ctx.request).toBe(request);
		expect(ctx.session).toBeNull();
		expect(ctx.resolved).toEqual(resolved);
		expect(ctx.provider).toBe(provider);
		expect(ctx.requestId).toBe("req_test");
		expect(ctx.responseId).toBe("resp_test");
		expect(ctx.createdAt).toBe(123);
		expect(ctx.logger).toBe(logger);
	});

	test("starts with empty diagnostics and supports addDiagnostic", () => {
		const ctx = createContext();
		const diagnostic: CompatibilityDiagnostic = {
			severity: "warn",
			code: "provider.unsupported_parameter",
			action: "ignored",
			message: "unsupported",
		};

		ctx.addDiagnostic(diagnostic);

		expect(ctx.diagnostics).toEqual([diagnostic]);
	});

	test("starts with an empty mutable attributes map", () => {
		const ctx = createContext();

		ctx.attributes.set("traceId", "trace_123");

		expect(ctx.attributes.size).toBe(1);
		expect(ctx.attributes.get("traceId")).toBe("trace_123");
	});

	test("starts with an empty request-scoped output contract", () => {
		const ctx = createContext();

		expect(ctx.outputContract.current().syntheticInstruction).toBeUndefined();
	});
});
