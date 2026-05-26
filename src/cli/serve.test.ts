import { afterEach, describe, expect, test } from "bun:test";
import { ApplicationContext } from "../context/application-context";
import type { Logger } from "../logger";
import { registerShutdownHandlers, serve } from "./serve";

const originalExit = process.exit;
const cleanups: Array<() => void> = [];

const validConfig = {
	server: { port: 3000 },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "secret-key",
			base_url: "https://example.test/api",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
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
		const cleanup = registerShutdownHandlers(
			{ stop: () => {} },
			() => {
				closed = true;
			},
			logger,
		);
		cleanups.push(cleanup);
		process.emit("SIGINT", "SIGINT");
		await new Promise((resolve) => setTimeout(resolve, 5));
		expect(closed).toBe(true);
		expect(exitCode).toBe(0);
		expect(logs).toContainEqual({
			event: "godex.shutting.down",
			attr: { signal: "SIGINT" },
		});
	});

	test("runs shutdown once across repeated signals", async () => {
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
		const cleanup = registerShutdownHandlers(
			{ stop: () => {} },
			() => {
				closeCount++;
			},
			logger,
		);
		cleanups.push(cleanup);

		process.emit("SIGINT", "SIGINT");
		process.emit("SIGTERM", "SIGTERM");
		process.emit("SIGINT", "SIGINT");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(closeCount).toBe(1);
		expect(exitCount).toBe(1);
	});

	test("still closes resources when server stop fails", async () => {
		const warnings: Array<{ event: string; attr?: Record<string, unknown> }> =
			[];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: (event, attr) => {
				warnings.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			error: () => {},
		};
		let closed = false;
		let exitCode: string | number | null | undefined;
		process.exit = ((code?: string | number | null | undefined) => {
			exitCode = code;
		}) as typeof process.exit;

		const cleanup = registerShutdownHandlers(
			{
				stop: () => {
					throw new Error("stop failed");
				},
			},
			() => {
				closed = true;
			},
			logger,
		);
		cleanups.push(cleanup);

		process.emit("SIGINT", "SIGINT");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(closed).toBe(true);
		expect(exitCode).toBe(0);
		expect(warnings).toContainEqual({
			event: "godex.shutdown.stop.error",
			attr: { error: "Error: stop failed" },
		});
	});

	test("logs resource cleanup failures during shutdown", async () => {
		const warnings: Array<{ event: string; attr?: Record<string, unknown> }> =
			[];
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: (event, attr) => {
				warnings.push({
					event,
					attr: typeof attr === "function" ? attr() : attr,
				});
			},
			error: () => {},
		};
		let exitCode: string | number | null | undefined;
		process.exit = ((code?: string | number | null | undefined) => {
			exitCode = code;
		}) as typeof process.exit;

		const cleanup = registerShutdownHandlers(
			{ port: 3000 },
			() => {
				throw new Error("close failed");
			},
			logger,
		);
		cleanups.push(cleanup);

		process.emit("SIGTERM", "SIGTERM");
		await new Promise((resolve) => setTimeout(resolve, 5));

		expect(exitCode).toBe(0);
		expect(warnings).toContainEqual({
			event: "godex.shutdown.close.error",
			attr: { error: "Error: close failed" },
		});
	});

	test("returns cleanup that removes registered signal listeners", () => {
		const logger: Logger = {
			level: "info",
			child: () => logger,
			trace: () => {},
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {},
		};
		const sigintCount = process.listenerCount("SIGINT");
		const sigtermCount = process.listenerCount("SIGTERM");

		const cleanup = registerShutdownHandlers(
			{ stop: () => {} },
			() => {},
			logger,
		);

		expect(process.listenerCount("SIGINT")).toBe(sigintCount + 1);
		expect(process.listenerCount("SIGTERM")).toBe(sigtermCount + 1);
		cleanup();
		expect(process.listenerCount("SIGINT")).toBe(sigintCount);
		expect(process.listenerCount("SIGTERM")).toBe(sigtermCount);
	});
});

describe("serve", () => {
	test("closes application resources when server startup fails", async () => {
		const close = ApplicationContext.prototype.close;
		let closeCount = 0;
		ApplicationContext.prototype.close = async () => {
			closeCount++;
		};

		try {
			await expect(
				serve(
					{},
					{
						stdout: { write: () => {} },
						loadConfigFromFile: (path) =>
							path === "godex.yaml"
								? { ...validConfig, logging: { level: "info" } }
								: null,
						startServer: () => {
							throw new Error("listen failed");
						},
					},
				),
			).rejects.toThrow("listen failed");
			expect(closeCount).toBe(1);
		} finally {
			ApplicationContext.prototype.close = close;
		}
	});

	test("does not print startup banner when server startup fails", async () => {
		const close = ApplicationContext.prototype.close;
		let output = "";
		ApplicationContext.prototype.close = async () => {};

		try {
			await expect(
				serve(
					{},
					{
						stdout: {
							write: (message) => {
								output += message;
							},
						},
						loadConfigFromFile: (path) =>
							path === "godex.yaml" ? validConfig : null,
						startServer: () => {
							throw new Error("listen failed");
						},
					},
				),
			).rejects.toThrow("listen failed");
			expect(output).toBe("");
		} finally {
			ApplicationContext.prototype.close = close;
		}
	});

	test("preserves the original startup error when resource cleanup fails", async () => {
		const close = ApplicationContext.prototype.close;
		let closeCount = 0;
		ApplicationContext.prototype.close = async () => {
			closeCount++;
			throw new Error("close failed");
		};

		try {
			await expect(
				serve(
					{},
					{
						stdout: { write: () => {} },
						loadConfigFromFile: (path) =>
							path === "godex.yaml"
								? { ...validConfig, logging: { level: "warn" } }
								: null,
						startServer: () => {
							throw new Error("listen failed");
						},
					},
				),
			).rejects.toThrow("listen failed");
			expect(closeCount).toBe(1);
		} finally {
			ApplicationContext.prototype.close = close;
		}
	});
});
