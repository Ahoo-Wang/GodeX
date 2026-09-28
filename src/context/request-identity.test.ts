import { describe, expect, test } from "bun:test";
import type { Logger } from "../logger";
import { createRequestIdentity } from "./request-identity";

function createCapturingLogger(): Logger & {
	childBindings: Record<string, unknown> | null;
	childLogger: Logger | null;
} {
	const logger = {
		level: "info" as const,
		childBindings: null as Record<string, unknown> | null,
		childLogger: null as Logger | null,
		child(bindings: Record<string, unknown>): Logger {
			this.childBindings = bindings;
			this.childLogger = {
				level: this.level,
				child: this.child.bind(this),
				trace: () => {},
				debug: () => {},
				info: () => {},
				warn: () => {},
				error: () => {},
			};
			return this.childLogger;
		},
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
	return logger;
}

describe("createRequestIdentity", () => {
	test("creates request and response IDs, timestamp, and scoped logger", () => {
		const logger = createCapturingLogger();

		const before = Math.floor(Date.now() / 1000);
		const identity = createRequestIdentity(logger);
		const after = Math.floor(Date.now() / 1000);

		expect(identity.requestId).toMatch(/^req_/);
		expect(identity.responseId).toMatch(/^resp_/);
		expect(identity.createdAt).toBeGreaterThanOrEqual(before);
		expect(identity.createdAt).toBeLessThanOrEqual(after);
		expect(identity.logger).toBe(logger.childLogger as Logger);
		expect(logger.childBindings).toEqual({
			request_id: identity.requestId,
			response_id: identity.responseId,
		});
	});
});
