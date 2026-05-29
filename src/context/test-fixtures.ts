import type { GodeXConfig } from "../config";
import type { LogAttr, Logger } from "../logger";
import { Registrar } from "../providers/registrar";
import { createTestProviderEdge } from "../testing/provider-edge";

export const baseConfig: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			spec: "zhipu",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: "http://127.0.0.1:1" },
		},
		deepseek: {
			spec: "deepseek",
			credentials: { api_key: "test-key" },
			endpoint: { base_url: "http://127.0.0.1:1" },
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
	trace: {
		enabled: false,
		path: "./data/trace.db",
		max_queue_size: 10000,
		flush_interval_ms: 1000,
		batch_size: 100,
		capture_payload: false,
		payload_max_bytes: 65536,
	},
};

export function createRegistrar(
	names: string[] = ["zhipu", "deepseek"],
): Registrar {
	const registrar = new Registrar();
	for (const name of names) {
		registrar.registerFactory(name, () => createTestProviderEdge({ name }));
	}
	return registrar;
}

export type CapturedLog = {
	level: "trace" | "debug" | "info" | "warn" | "error";
	event: string;
	attr?: Record<string, unknown>;
};

export function createCapturingLogger(logs: CapturedLog[]): Logger {
	const logger: Logger = {
		level: "trace",
		child: () => logger,
		trace: (event, attr) => capture("trace", event, attr),
		debug: (event, attr) => capture("debug", event, attr),
		info: (event, attr) => capture("info", event, attr),
		warn: (event, attr) => capture("warn", event, attr),
		error: (event, attr) => capture("error", event, attr),
	};

	function capture(
		level: CapturedLog["level"],
		event: string,
		attr?: LogAttr,
	): void {
		logs.push({
			level,
			event,
			attr: typeof attr === "function" ? attr() : attr,
		});
	}

	return logger;
}
