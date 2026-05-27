import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ProviderMapper } from "../adapter/provider";
import type { GodeXConfig } from "../config";
import type { LogAttr, Logger } from "../logger";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";
import { Registrar } from "../providers/registrar";
import type { ResponsesContext } from "./responses-context";

export const baseConfig: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:1",
		},
		openai: {
			api_key: "test-key",
			base_url: "http://127.0.0.1:1",
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

export class FakeMapper
	implements
		ProviderMapper<Record<string, unknown>, Record<string, unknown>, unknown>
{
	readonly request = {
		map: (): Record<string, unknown> => ({}),
	};

	readonly response = {
		map: (ctx: ResponsesContext): ResponseObject => ({
			id: ctx.responseId,
			object: "response",
			created_at: ctx.createdAt,
			status: "completed",
			model: ctx.resolved.model,
			output: [],
		}),
	};

	readonly stream = {
		map: (
			_ctx: ResponsesContext,
			_event: JsonServerSentEvent<unknown>,
		): ResponseStreamEvent[] => [],
	};
}

export function createRegistrar(
	names: string[] = ["zhipu", "openai"],
): Registrar {
	const registrar = new Registrar();
	for (const name of names) {
		registrar.registerFactory(name, () => ({
			name,
			mapper: new FakeMapper(),
			client: {
				async request(): Promise<Record<string, unknown>> {
					return {};
				},
				async stream() {
					return new ReadableStream<JsonServerSentEvent<unknown>>({
						start(controller) {
							controller.close();
						},
					});
				},
			},
		}));
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
