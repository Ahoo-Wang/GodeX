import { afterEach, describe, expect, test } from "bun:test";
import type { GodexConfig } from "../config";
import type { Logger } from "../logger";
import { startServer } from ".";

const { version } = require("../../package.json");

const originalServe = Bun.serve;

const config: GodexConfig = {
	server: { port: 31_456, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "test-key",
			base_url: "https://example.test/api",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

const logEvents: Array<{ event: string; attr?: Record<string, unknown> }> = [];

const logger: Logger = {
	level: "error",
	component: "test",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: (event, attr) => {
		logEvents.push({
			event,
			attr: typeof attr === "function" ? attr() : attr,
		});
	},
	warn: () => {},
	error: () => {},
};

afterEach(() => {
	Bun.serve = originalServe;
	logEvents.length = 0;
});

describe("startServer", () => {
	test("passes configured host to Bun.serve", () => {
		let options: Parameters<typeof Bun.serve>[0] | undefined;
		Bun.serve = ((serveOptions: Parameters<typeof Bun.serve>[0]) => {
			options = serveOptions;
			return {
				port: config.server.port,
				stop: () => {},
			} as ReturnType<typeof Bun.serve>;
		}) as typeof Bun.serve;

		startServer({
			config,
			configPath: "godex.yaml",
			logger,
			routes: {},
		});

		expect(options).toEqual(
			expect.objectContaining({
				hostname: "127.0.0.1",
				port: 31_456,
			}),
		);
	});

	test("logs the Godex version when the server starts", () => {
		Bun.serve = (() =>
			({
				port: config.server.port,
				stop: () => {},
			}) as ReturnType<typeof Bun.serve>) as typeof Bun.serve;

		startServer({
			config,
			configPath: "godex.yaml",
			logger,
			routes: {},
		});

		expect(logEvents).toContainEqual(
			expect.objectContaining({
				event: "server_started",
				attr: expect.objectContaining({ version }),
			}),
		);
	});

	test("handle404 returns JSON 404 response", async () => {
		let options: Parameters<typeof Bun.serve>[0] | undefined;
		Bun.serve = ((serveOptions: Parameters<typeof Bun.serve>[0]) => {
			options = serveOptions;
			return {
				port: config.server.port,
				stop: () => {},
			} as ReturnType<typeof Bun.serve>;
		}) as typeof Bun.serve;

		startServer({
			config,
			configPath: "godex.yaml",
			logger,
			routes: {},
		});

		const fetch = options?.fetch as
			| ((req: Request) => Response | Promise<Response>)
			| undefined;
		const res = await fetch?.(new Request("http://godex.test/unknown"));

		expect(res?.status).toBe(404);
		expect(res?.headers.get("Content-Type")).toBe("application/json");
		const body = (await res?.json()) as { error: { code: string } };
		expect(body.error.code).toBe("not_found");
	});
});
