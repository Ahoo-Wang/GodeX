import { afterEach, describe, expect, test } from "bun:test";
import type { Logger } from "../logger";
import { registerShutdownHandlers } from "./serve";

const originalExit = process.exit;

afterEach(() => {
	process.exit = originalExit;
});

describe("registerShutdownHandlers", () => {
	test("logs shutdown and calls closeResources callback", async () => {
		const logs: Array<{ event: string; attr?: Record<string, unknown> }> = [];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: (event, attr) => {
				logs.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			warn: () => {},
			error: () => {},
		};
		let closed = false;
		let exitCode: string | number | null | undefined;
		process.exit = ((code?: string | number | null | undefined) => {
			exitCode = code;
		}) as typeof process.exit;
		registerShutdownHandlers(
			{ stop: () => {} },
			() => {
				closed = true;
			},
			logger,
		);
		process.emit("SIGINT", "SIGINT");
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(closed).toBe(true);
		expect(exitCode).toBe(0);
		expect(logs).toContainEqual({
			event: "godex.shutting.down",
			attr: { signal: "SIGINT" },
		});
	});

	test("runs shutdown once for repeated signals", async () => {
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		let closeCount = 0;
		let exitCount = 0;
		process.exit = (() => {
			exitCount++;
		}) as typeof process.exit;
		registerShutdownHandlers(
			{ stop: () => {} },
			() => {
				closeCount++;
			},
			logger,
		);

		process.emit("SIGINT", "SIGINT");
		process.emit("SIGINT", "SIGINT");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(closeCount).toBe(1);
		expect(exitCount).toBe(1);
	});
});
