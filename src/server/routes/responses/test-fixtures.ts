import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ProviderMapper } from "../../../adapter/provider";
import type { GodeXConfig } from "../../../config";
import { ApplicationContext } from "../../../context/application-context";
import type { ResponsesContext } from "../../../context/responses-context";
import type { LogAttr, Logger } from "../../../logger";
import type {
	ResponseCreateRequest,
	ResponseObject,
	ResponseStreamEvent,
} from "../../../protocol/openai/responses";
import { Registrar } from "../../../providers/registrar";

export const testConfig: GodeXConfig = {
	server: { port: 0, host: "127.0.0.1" },
	default_provider: "zhipu",
	providers: {
		zhipu: {
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
		map: (ctx: ResponsesContext): ResponseObject => responseObject(ctx),
	};

	readonly stream = {
		map: (
			_ctx: ResponsesContext,
			_event: JsonServerSentEvent<unknown>,
		): ResponseStreamEvent[] => [],
	};
}

export function responseObject(ctx: ResponsesContext): ResponseObject {
	return {
		id: ctx.responseId,
		object: "response",
		created_at: ctx.createdAt,
		status: "completed",
		model: ctx.resolved.model,
		output: [],
	};
}

export function createTestApp(
	mapper: ProviderMapper<unknown, unknown, unknown> = new FakeMapper(),
	client: unknown = {
		async request(): Promise<Record<string, unknown>> {
			return {};
		},
		async stream() {
			return new ReadableStream({
				start(controller) {
					controller.close();
				},
			});
		},
	},
): ApplicationContext {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () => ({
		name: "mock",
		mapper,
		client: client as never,
	}));
	return new ApplicationContext(testConfig, registrar);
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

export function jsonRequest(body: unknown): Request {
	return new Request("http://godex.test/v1/responses", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
}

export function textRequest(body: string): Request {
	return new Request("http://godex.test/v1/responses", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body,
	});
}

export const basicRequest: ResponseCreateRequest = {
	model: "zhipu/glm-5.1",
	input: "hi",
};
