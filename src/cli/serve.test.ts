import { afterEach, describe, expect, test } from "bun:test";
import type { Logger } from "../logger";
import type { ResponseSessionStore } from "../session";
import { registerShutdownHandlers } from "./serve";

const originalExit = process.exit;

afterEach(() => {
	process.exit = originalExit;
});

describe("registerShutdownHandlers", () => {
	test("logs shutdown with dot-only event name", () => {
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
		const beforeSigint = process.listeners("SIGINT");
		const beforeSigterm = process.listeners("SIGTERM");
		let sigintListener: NodeJS.SignalsListener | undefined;
		let sigtermListener: NodeJS.SignalsListener | undefined;
		process.exit = ((code?: string | number | null | undefined) => {
			throw new Error(`exit:${String(code)}`);
		}) as typeof process.exit;

		try {
			registerShutdownHandlers(
				{ stop: () => {} },
				{} as ResponseSessionStore,
				logger,
			);
			sigintListener = process
				.listeners("SIGINT")
				.find((listener) => !beforeSigint.includes(listener)) as
				| NodeJS.SignalsListener
				| undefined;
			sigtermListener = process
				.listeners("SIGTERM")
				.find((listener) => !beforeSigterm.includes(listener)) as
				| NodeJS.SignalsListener
				| undefined;

			expect(() => sigintListener?.("SIGINT")).toThrow("exit:0");
			expect(logs).toContainEqual({
				event: "godex.shutting.down",
				attr: { signal: "SIGINT" },
			});
		} finally {
			if (sigintListener) {
				process.removeListener("SIGINT", sigintListener);
			}
			if (sigtermListener) {
				process.removeListener("SIGTERM", sigtermListener);
			}
		}
	});
});
