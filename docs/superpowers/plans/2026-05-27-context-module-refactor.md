# Context Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/context` into focused application-service assembly and per-request context creation boundaries.

**Architecture:** `ApplicationContext` remains the lifecycle container, while service assembly moves to small factories. `ResponsesContext` becomes a request data object, and `createResponsesContext()` owns the per-request creation workflow used by the responses route.

**Tech Stack:** TypeScript strict mode, Bun runtime and test runner, existing GodeX error/session/provider/logger/trace modules.

---

## File Structure

Create these files:

- `src/context/request-identity.ts`: creates request IDs, response IDs, timestamps, and scoped child loggers.
- `src/context/request-identity.test.ts`: tests request identity generation in isolation.
- `src/context/session-store-factory.ts`: creates memory or SQLite response session stores from session config.
- `src/context/session-store-factory.test.ts`: tests session store selection.
- `src/context/trace-services.ts`: creates trace recorder and prompt-cache services from trace config.
- `src/context/trace-services.test.ts`: tests enabled and disabled trace service assembly.
- `src/context/provider-bootstrap.ts`: creates or reuses a registrar and registers configured providers.
- `src/context/provider-bootstrap.test.ts`: tests registrar bootstrap behavior.
- `src/context/application-services.ts`: composes all dependencies used by `ApplicationContext`.
- `src/context/application-services.test.ts`: tests application-service composition.
- `src/context/responses-session.ts`: resolves optional `previous_response_id` chains for a request context.
- `src/context/responses-session.test.ts`: tests request session resolution.
- `src/context/responses-context-factory.ts`: creates `ResponsesContext` instances from an application context and request body.
- `src/context/responses-context-factory.test.ts`: tests model/provider/session resolution and error mapping.

Modify these files:

- `src/context/application-context.ts`: delegate service assembly to `createApplicationServices()`.
- `src/context/application-context.test.ts`: keep lifecycle/container tests only.
- `src/context/responses-context.ts`: remove static creation workflow and accept an init object.
- `src/context/responses-context.test.ts`: keep data-object tests only.
- `src/context/index.ts`: export the new context factories.
- `src/server/routes/responses/handler.ts`: call `createResponsesContext()` instead of `ResponsesContext.create()`.
- `src/server/routes/responses/test-fixtures.test.ts`: update context creation helper usage.
- `src/server/routes/responses/response-dispatcher.test.ts`: update context creation helper usage.
- `src/server/routes/responses/handler.test.ts`: keep route assertions green after factory replacement.
- Any test found by `rg -n "ResponsesContext\\.create" src` after removing the static method.

---

### Task 1: Request Identity And ResponsesContext Data Object

**Files:**

- Create: `src/context/request-identity.ts`
- Create: `src/context/request-identity.test.ts`
- Modify: `src/context/responses-context.ts`
- Modify: `src/context/responses-context.test.ts`
- Modify: `src/context/index.ts`

- [ ] **Step 1: Write the failing request identity test**

Replace or create `src/context/request-identity.test.ts` with:

```ts
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

		const identity = createRequestIdentity(logger);

		expect(identity.requestId).toMatch(/^req_/);
		expect(identity.responseId).toMatch(/^resp_/);
		expect(identity.createdAt).toBeGreaterThan(0);
		expect(identity.logger).toBe(logger.childLogger);
		expect(logger.childBindings).toEqual({
			request_id: identity.requestId,
			response_id: identity.responseId,
		});
	});
});
```

- [ ] **Step 2: Run the request identity test to verify it fails**

Run:

```bash
bun test src/context/request-identity.test.ts
```

Expected: FAIL because `src/context/request-identity.ts` does not exist.

- [ ] **Step 3: Implement the request identity factory**

Create `src/context/request-identity.ts`:

```ts
import { nanoid } from "nanoid";
import type { Logger } from "../logger";

export interface RequestIdentity {
	requestId: string;
	responseId: string;
	createdAt: number;
	logger: Logger;
}

export function createRequestIdentity(logger: Logger): RequestIdentity {
	const requestId = `req_${nanoid()}`;
	const responseId = `resp_${nanoid()}`;
	return {
		requestId,
		responseId,
		createdAt: Math.floor(Date.now() / 1000),
		logger: logger.child({
			request_id: requestId,
			response_id: responseId,
		}),
	};
}
```

- [ ] **Step 4: Run the request identity test to verify it passes**

Run:

```bash
bun test src/context/request-identity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing ResponsesContext data-object test**

Replace `src/context/responses-context.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import type { CompatibilityDiagnostic } from "../adapter/compatibility";
import type { Provider } from "../adapter/provider";
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ResponseSessionSnapshot } from "../session";
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

const provider = {
	name: "mock",
	mapper: {
		request: { map: () => ({}) },
		response: { map: () => ({}) as never },
		stream: {
			map: () => [] as never[],
		},
	},
	client: {
		request: async () => ({}),
		stream: async () => new ReadableStream(),
	},
} satisfies Provider<unknown, unknown, unknown>;

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
		const request = { model: "zhipu/glm-5.1", input: "hello" } as ResponseCreateRequest;
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
});
```

- [ ] **Step 6: Run the ResponsesContext data-object test to verify it fails**

Run:

```bash
bun test src/context/responses-context.test.ts
```

Expected: FAIL because the current constructor is private and positional.

- [ ] **Step 7: Implement ResponsesContext as a data object**

Replace `src/context/responses-context.ts` with:

```ts
import type { CompatibilityDiagnostic } from "../adapter/compatibility";
import type { Provider } from "../adapter/provider";
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ResponseSessionSnapshot } from "../session";
import type { ApplicationContext } from "./application-context";

export interface ResponsesContextInit {
	app: ApplicationContext;
	request: ResponseCreateRequest;
	session: ResponseSessionSnapshot | null;
	resolved: ResolvedModel;
	provider: Provider<unknown, unknown, unknown>;
	requestId: string;
	responseId: string;
	createdAt: number;
	logger: Logger;
}

export class ResponsesContext {
	readonly app: ApplicationContext;
	readonly request: ResponseCreateRequest;
	readonly session: ResponseSessionSnapshot | null;
	readonly resolved: ResolvedModel;
	readonly provider: Provider<unknown, unknown, unknown>;
	readonly requestId: string;
	readonly responseId: string;
	readonly createdAt: number;
	readonly logger: Logger;
	readonly diagnostics: CompatibilityDiagnostic[];
	readonly attributes: Map<string, unknown>;

	constructor(init: ResponsesContextInit) {
		this.app = init.app;
		this.request = init.request;
		this.session = init.session;
		this.resolved = init.resolved;
		this.provider = init.provider;
		this.requestId = init.requestId;
		this.responseId = init.responseId;
		this.createdAt = init.createdAt;
		this.logger = init.logger;
		this.diagnostics = [];
		this.attributes = new Map();
	}

	addDiagnostic(diagnostic: CompatibilityDiagnostic): void {
		this.diagnostics.push(diagnostic);
	}
}
```

- [ ] **Step 8: Export request identity and rerun focused tests**

Modify `src/context/index.ts`:

```ts
export * from "./application-context";
export * from "./request-identity";
export * from "./responses-context";
```

Run:

```bash
bun test src/context/request-identity.test.ts src/context/responses-context.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 1**

Run:

```bash
git add src/context/request-identity.ts src/context/request-identity.test.ts src/context/responses-context.ts src/context/responses-context.test.ts src/context/index.ts
git commit -m "refactor(context): split request identity and response context data"
```

Expected: commit succeeds.

---

### Task 2: Session Store And Trace Service Factories

**Files:**

- Create: `src/context/session-store-factory.ts`
- Create: `src/context/session-store-factory.test.ts`
- Create: `src/context/trace-services.ts`
- Create: `src/context/trace-services.test.ts`
- Modify: `src/context/index.ts`

- [ ] **Step 1: Write the failing session store factory test**

Create `src/context/session-store-factory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { SessionConfig } from "../config";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";
import { createResponseSessionStore } from "./session-store-factory";

describe("createResponseSessionStore", () => {
	test("creates a memory store for memory config", () => {
		const store = createResponseSessionStore({ backend: "memory" });

		expect(store).toBeInstanceOf(MemoryResponseSessionStore);
	});

	test("creates a SQLite store for configured sqlite path", () => {
		const store = createResponseSessionStore({
			backend: "sqlite",
			sqlite: { path: ":memory:" },
		});

		expect(store).toBeInstanceOf(SQLiteResponseSessionStore);
		store.close?.();
	});

	test("creates a SQLite store when sqlite path is omitted", () => {
		const store = createResponseSessionStore({
			backend: "sqlite",
		} as SessionConfig);

		expect(store).toBeInstanceOf(SQLiteResponseSessionStore);
		store.close?.();
	});
});
```

- [ ] **Step 2: Run the session store factory test to verify it fails**

Run:

```bash
bun test src/context/session-store-factory.test.ts
```

Expected: FAIL because `src/context/session-store-factory.ts` does not exist.

- [ ] **Step 3: Implement the session store factory**

Create `src/context/session-store-factory.ts`:

```ts
import type { SessionConfig } from "../config";
import { resolveDefaultSqlitePath } from "../config";
import type { ResponseSessionStore } from "../session";
import { MemoryResponseSessionStore } from "../session/memory";
import { SQLiteResponseSessionStore } from "../session/sqlite";

export function createResponseSessionStore(
	config: SessionConfig,
): ResponseSessionStore {
	if (config.backend === "sqlite") {
		return new SQLiteResponseSessionStore(
			config.sqlite?.path ?? resolveDefaultSqlitePath(),
		);
	}
	return new MemoryResponseSessionStore();
}
```

- [ ] **Step 4: Run the session store factory test to verify it passes**

Run:

```bash
bun test src/context/session-store-factory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing trace services test**

Create `src/context/trace-services.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import { NoopTraceRecorder } from "../trace";
import { createTraceServices } from "./trace-services";

const logger: Logger = {
	level: "error",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const baseTrace: TraceConfig = {
	enabled: false,
	path: ":memory:",
	max_queue_size: 10,
	flush_interval_ms: 1000,
	batch_size: 100,
	capture_payload: false,
	payload_max_bytes: 65536,
};

describe("createTraceServices", () => {
	test("creates noop recorder and prompt-cache services when trace is disabled", () => {
		const services = createTraceServices(baseTrace, logger);

		expect(services.traceEnabled).toBe(false);
		expect(services.traceRecorder).toBeInstanceOf(NoopTraceRecorder);
		expect(services.promptCacheRequestAnalyzer).toBeDefined();
		expect(services.promptCacheDetector).toBeDefined();
		expect(services.promptCacheObservationIndex).toBeDefined();
	});

	test("creates an async recorder when trace is enabled", async () => {
		const services = createTraceServices(
			{ ...baseTrace, enabled: true, path: ":memory:" },
			logger,
		);

		expect(services.traceEnabled).toBe(true);
		expect(services.traceRecorder).not.toBeInstanceOf(NoopTraceRecorder);
		await services.traceRecorder.close?.();
	});

	test("uses at least 1000 prompt-cache observations", () => {
		const services = createTraceServices(
			{ ...baseTrace, max_queue_size: 1 },
			logger,
		);

		for (let i = 0; i < 1000; i++) {
			services.promptCacheObservationIndex.remember({
				provider: "zhipu",
				model: "glm",
				cache_identity_key: `key_${i}`,
				prefix_hash: `hash_${i}`,
				prefix_bytes: i,
				created_at: i,
				request_id: `req_${i}`,
			});
		}

		expect(
			services.promptCacheObservationIndex.get({
				provider: "zhipu",
				model: "glm",
				cache_identity_key: "key_0",
			}),
		).not.toBeNull();
	});
});
```

- [ ] **Step 6: Run the trace services test to verify it fails**

Run:

```bash
bun test src/context/trace-services.test.ts
```

Expected: FAIL because `src/context/trace-services.ts` does not exist.

- [ ] **Step 7: Implement trace services**

Create `src/context/trace-services.ts`:

```ts
import type { TraceConfig } from "../config";
import type { Logger } from "../logger";
import {
	AsyncTraceRecorder,
	ChatCompletionPromptCacheRequestAnalyzer,
	LruPromptCacheObservationIndex,
	NoopTraceRecorder,
	PrefixPromptCacheDetector,
	type PromptCacheDetector,
	type PromptCacheObservationIndex,
	type ProviderPromptCacheRequestAnalyzer,
	SQLiteTraceStore,
	type TraceRecorder,
} from "../trace";

export interface TraceServices {
	traceEnabled: boolean;
	traceRecorder: TraceRecorder;
	promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	promptCacheDetector: PromptCacheDetector;
	promptCacheObservationIndex: PromptCacheObservationIndex;
}

export function createTraceServices(
	config: TraceConfig,
	logger: Logger,
): TraceServices {
	const traceEnabled = config.enabled;
	return {
		traceEnabled,
		traceRecorder: traceEnabled
			? new AsyncTraceRecorder({
					store: new SQLiteTraceStore(config.path),
					logger,
					maxQueueSize: config.max_queue_size,
					flushIntervalMs: config.flush_interval_ms,
					batchSize: config.batch_size,
					capturePayload: config.capture_payload,
					payloadMaxBytes: config.payload_max_bytes,
				})
			: new NoopTraceRecorder(),
		promptCacheRequestAnalyzer:
			new ChatCompletionPromptCacheRequestAnalyzer(),
		promptCacheDetector: new PrefixPromptCacheDetector(),
		promptCacheObservationIndex: new LruPromptCacheObservationIndex(
			Math.max(1000, config.max_queue_size),
		),
	};
}
```

- [ ] **Step 8: Export factories and rerun focused tests**

Modify `src/context/index.ts`:

```ts
export * from "./application-context";
export * from "./request-identity";
export * from "./responses-context";
export * from "./session-store-factory";
export * from "./trace-services";
```

Run:

```bash
bun test src/context/session-store-factory.test.ts src/context/trace-services.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 2**

Run:

```bash
git add src/context/session-store-factory.ts src/context/session-store-factory.test.ts src/context/trace-services.ts src/context/trace-services.test.ts src/context/index.ts
git commit -m "refactor(context): extract service factories"
```

Expected: commit succeeds.

---

### Task 3: Provider Bootstrap, Application Services, And ApplicationContext

**Files:**

- Create: `src/context/provider-bootstrap.ts`
- Create: `src/context/provider-bootstrap.test.ts`
- Create: `src/context/application-services.ts`
- Create: `src/context/application-services.test.ts`
- Modify: `src/context/application-context.ts`
- Modify: `src/context/application-context.test.ts`
- Modify: `src/context/index.ts`

- [ ] **Step 1: Write the failing provider bootstrap test**

Create `src/context/provider-bootstrap.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import { Registrar } from "../providers/registrar";
import { createConfiguredRegistrar } from "./provider-bootstrap";

const logger: Logger = {
	level: "error",
	child: () => logger,
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
};

const providers: GodeXConfig["providers"] = {
	zhipu: { api_key: "test-key", base_url: "http://127.0.0.1:1" },
};

describe("createConfiguredRegistrar", () => {
	test("creates a built-in registrar when none is supplied", () => {
		const registrar = createConfiguredRegistrar(providers, logger);

		expect(registrar.list()).toEqual(["zhipu"]);
		expect(registrar.resolve("zhipu").name).toBe("zhipu");
	});

	test("reuses the supplied registrar and registers configured providers once", () => {
		const registrar = new Registrar();
		let calls = 0;
		registrar.registerFactory("zhipu", () => {
			calls++;
			return {
				name: "mock",
				mapper: {
					request: { map: () => ({}) },
					response: { map: () => ({}) as never },
					stream: {
						map: () => [] as never[],
					},
				},
				client: {
					request: async () => ({}),
					stream: async () => new ReadableStream(),
				},
			};
		});

		const configured = createConfiguredRegistrar(providers, logger, registrar);

		expect(configured).toBe(registrar);
		expect(calls).toBe(1);
		expect(configured.resolve("zhipu").name).toBe("mock");
	});

	test("keeps unsupported provider reporting on the registrar", () => {
		const registrar = createConfiguredRegistrar(
			{ unsupported: { api_key: "k", base_url: "http://127.0.0.1" } },
			logger,
			new Registrar(),
		);

		expect(registrar.list()).toEqual([]);
		expect(registrar.unsupported()).toEqual(["unsupported"]);
	});
});
```

- [ ] **Step 2: Run the provider bootstrap test to verify it fails**

Run:

```bash
bun test src/context/provider-bootstrap.test.ts
```

Expected: FAIL because `src/context/provider-bootstrap.ts` does not exist.

- [ ] **Step 3: Implement provider bootstrap**

Create `src/context/provider-bootstrap.ts`:

```ts
import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import { createBuiltinRegistrar } from "../providers/builtin";
import type { Registrar } from "../providers/registrar";

export function createConfiguredRegistrar(
	providers: GodeXConfig["providers"],
	logger: Logger,
	registrar?: Registrar,
): Registrar {
	const configuredRegistrar = registrar ?? createBuiltinRegistrar();
	configuredRegistrar.registerProviders(providers, logger);
	return configuredRegistrar;
}
```

- [ ] **Step 4: Run the provider bootstrap test to verify it passes**

Run:

```bash
bun test src/context/provider-bootstrap.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing application services test**

Create `src/context/application-services.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { GodeXConfig } from "../config";
import { Registrar } from "../providers/registrar";
import { MemoryResponseSessionStore } from "../session/memory";
import { NoopTraceRecorder } from "../trace";
import { createApplicationServices } from "./application-services";

const config: GodeXConfig = {
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

describe("createApplicationServices", () => {
	test("composes all services from config", () => {
		const services = createApplicationServices(config);

		expect(services.logger.level).toBe("error");
		expect(services.resolver.resolve("glm-5.1")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
		expect(services.registrar.resolve("zhipu")).toBeDefined();
		expect(services.adapter).toBeDefined();
		expect(services.sessionStore).toBeInstanceOf(MemoryResponseSessionStore);
		expect(services.traceEnabled).toBe(false);
		expect(services.traceRecorder).toBeInstanceOf(NoopTraceRecorder);
		expect(services.promptCacheRequestAnalyzer).toBeDefined();
		expect(services.promptCacheDetector).toBeDefined();
		expect(services.promptCacheObservationIndex).toBeDefined();
	});

	test("reuses a supplied registrar", () => {
		const registrar = new Registrar();
		registrar.registerFactory("zhipu", () => ({
			name: "mock",
			mapper: {
				request: { map: () => ({}) },
				response: { map: () => ({}) as never },
				stream: {
					map: () => [] as never[],
				},
			},
			client: {
				request: async () => ({}),
				stream: async () => new ReadableStream(),
			},
		}));

		const services = createApplicationServices(config, registrar);

		expect(services.registrar).toBe(registrar);
		expect(services.registrar.resolve("zhipu").name).toBe("mock");
	});
});
```

- [ ] **Step 6: Run the application services test to verify it fails**

Run:

```bash
bun test src/context/application-services.test.ts
```

Expected: FAIL because `src/context/application-services.ts` does not exist.

- [ ] **Step 7: Implement application services**

Create `src/context/application-services.ts`:

```ts
import type { Adapter } from "../adapter/adapter";
import { DefaultAdapter } from "../adapter/default-adapter";
import type { GodeXConfig } from "../config";
import { createLogger, type Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import { ModelResolver } from "../resolver";
import type { ResponseSessionStore } from "../session";
import type {
	PromptCacheDetector,
	PromptCacheObservationIndex,
	ProviderPromptCacheRequestAnalyzer,
	TraceRecorder,
} from "../trace";
import { createConfiguredRegistrar } from "./provider-bootstrap";
import { createResponseSessionStore } from "./session-store-factory";
import { createTraceServices } from "./trace-services";

export interface ApplicationServices {
	logger: Logger;
	resolver: ModelResolver;
	registrar: Registrar;
	adapter: Adapter;
	sessionStore: ResponseSessionStore;
	traceRecorder: TraceRecorder;
	promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	promptCacheDetector: PromptCacheDetector;
	promptCacheObservationIndex: PromptCacheObservationIndex;
	traceEnabled: boolean;
}

export function createApplicationServices(
	config: GodeXConfig,
	registrar?: Registrar,
): ApplicationServices {
	const logger = createLogger(config.logging);
	const resolver = new ModelResolver(
		config.default_provider,
		config.models?.aliases,
	);
	const configuredRegistrar = createConfiguredRegistrar(
		config.providers,
		logger,
		registrar,
	);
	const trace = createTraceServices(config.trace, logger);

	return {
		logger,
		resolver,
		registrar: configuredRegistrar,
		adapter: new DefaultAdapter(),
		sessionStore: createResponseSessionStore(config.session),
		traceRecorder: trace.traceRecorder,
		promptCacheRequestAnalyzer: trace.promptCacheRequestAnalyzer,
		promptCacheDetector: trace.promptCacheDetector,
		promptCacheObservationIndex: trace.promptCacheObservationIndex,
		traceEnabled: trace.traceEnabled,
	};
}
```

- [ ] **Step 8: Rewrite ApplicationContext to delegate assembly**

Replace `src/context/application-context.ts` with:

```ts
import type { Adapter } from "../adapter/adapter";
import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import type { Registrar } from "../providers/registrar";
import type { ModelResolver } from "../resolver";
import type { ResponseSessionStore } from "../session";
import type {
	PromptCacheDetector,
	PromptCacheObservationIndex,
	ProviderPromptCacheRequestAnalyzer,
	TraceRecorder,
} from "../trace";
import { createApplicationServices } from "./application-services";

export class ApplicationContext {
	readonly config: GodeXConfig;
	readonly logger: Logger;
	readonly resolver: ModelResolver;
	readonly registrar: Registrar;
	readonly adapter: Adapter;
	readonly sessionStore: ResponseSessionStore;
	readonly traceRecorder: TraceRecorder;
	readonly promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	readonly promptCacheDetector: PromptCacheDetector;
	readonly promptCacheObservationIndex: PromptCacheObservationIndex;
	readonly traceEnabled: boolean;

	constructor(config: GodeXConfig, registrar?: Registrar) {
		const services = createApplicationServices(config, registrar);
		this.config = config;
		this.logger = services.logger;
		this.resolver = services.resolver;
		this.registrar = services.registrar;
		this.adapter = services.adapter;
		this.sessionStore = services.sessionStore;
		this.traceRecorder = services.traceRecorder;
		this.promptCacheRequestAnalyzer = services.promptCacheRequestAnalyzer;
		this.promptCacheDetector = services.promptCacheDetector;
		this.promptCacheObservationIndex = services.promptCacheObservationIndex;
		this.traceEnabled = services.traceEnabled;
	}

	async close(): Promise<void> {
		try {
			await this.traceRecorder.close?.();
		} catch (err) {
			this.logger.warn("trace.close.error", () => ({ error: String(err) }));
		}
		this.sessionStore.close?.();
	}
}
```

- [ ] **Step 9: Narrow ApplicationContext tests and rerun focused service tests**

Keep `src/context/application-context.test.ts` focused on the container and lifecycle. The file should include these existing behaviors:

```ts
test("creates all services from config", () => {
	const app = new ApplicationContext(config);
	expect(app.config).toBe(config);
	expect(app.logger.level).toBe("error");
	expect(app.resolver).toBeDefined();
	expect(app.registrar).toBeDefined();
	expect(app.adapter).toBeDefined();
	expect(app.sessionStore).toBeDefined();
});

test("closes trace recorder and session store", async () => {
	const app = new ApplicationContext(config);
	let traceClosed = false;
	let sessionClosed = false;
	(
		app as unknown as {
			traceRecorder: { record(_e: unknown): void; close(): void };
		}
	).traceRecorder = {
		record: () => {},
		close: () => {
			traceClosed = true;
		},
	};
	(app.sessionStore as { close?: () => void }).close = () => {
		sessionClosed = true;
	};
	await app.close();
	expect(traceClosed).toBe(true);
	expect(sessionClosed).toBe(true);
});
```

Modify `src/context/index.ts`:

```ts
export * from "./application-context";
export * from "./application-services";
export * from "./provider-bootstrap";
export * from "./request-identity";
export * from "./responses-context";
export * from "./session-store-factory";
export * from "./trace-services";
```

Run:

```bash
bun test src/context/provider-bootstrap.test.ts src/context/application-services.test.ts src/context/application-context.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 3**

Run:

```bash
git add src/context/provider-bootstrap.ts src/context/provider-bootstrap.test.ts src/context/application-services.ts src/context/application-services.test.ts src/context/application-context.ts src/context/application-context.test.ts src/context/index.ts
git commit -m "refactor(context): extract application service assembly"
```

Expected: commit succeeds.

---

### Task 4: Responses Session Resolution And Context Factory

**Files:**

- Create: `src/context/responses-session.ts`
- Create: `src/context/responses-session.test.ts`
- Create: `src/context/responses-context-factory.ts`
- Create: `src/context/responses-context-factory.test.ts`
- Modify: `src/context/index.ts`

- [ ] **Step 1: Write the failing responses session test**

Create `src/context/responses-session.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { Logger } from "../logger";
import type { StoredResponseSession } from "../session";
import { ApplicationContext } from "./application-context";
import { resolveResponsesSession } from "./responses-session";
import { config, createRegistrar } from "./test-fixtures";

function createCapturingLogger(): Logger & { debugEvents: string[] } {
	return {
		level: "debug",
		debugEvents: [],
		child: () => createCapturingLogger(),
		trace: () => {},
		debug(event: string) {
			this.debugEvents.push(event);
		},
		info: () => {},
		warn: () => {},
		error: () => {},
	};
}

describe("resolveResponsesSession", () => {
	test("returns null without previous_response_id", async () => {
		const app = new ApplicationContext(config, createRegistrar());
		const logger = createCapturingLogger();

		const session = await resolveResponsesSession(
			app,
			{ model: "glm-5.1", input: "hi" },
			logger,
		);

		expect(session).toBeNull();
	});

	test("resolves and logs a session chain", async () => {
		const app = new ApplicationContext(config, createRegistrar());
		const logger = createCapturingLogger();
		await app.sessionStore.save({
			id: "resp_prev",
			created_at: 123,
			status: "completed",
			request: { input: "hello" },
			response: { id: "resp_prev", output: [] },
		} as StoredResponseSession);

		const session = await resolveResponsesSession(
			app,
			{
				model: "glm-5.1",
				input: "hi",
				previous_response_id: "resp_prev",
			},
			logger,
		);

		expect(session?.previous_response_id).toBe("resp_prev");
		expect(session?.turns).toHaveLength(1);
		expect(logger.debugEvents).toEqual(["session.chain.resolved"]);
	});
});
```

- [ ] **Step 2: Add shared context test fixtures**

Create `src/context/test-fixtures.ts`:

```ts
import type { GodeXConfig } from "../config";
import { Registrar } from "../providers/registrar";

export const config: GodeXConfig = {
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

export function createRegistrar(): Registrar {
	const registrar = new Registrar();
	registrar.registerFactory("zhipu", () => ({
		name: "mock",
		mapper: {
			request: { map: () => ({}) },
			response: { map: () => ({}) as never },
			stream: {
				map: () => [] as never[],
			},
		},
		client: {
			request: async () => ({}),
			stream: async () => new ReadableStream(),
		},
	}));
	return registrar;
}
```

Run:

```bash
bun test src/context/responses-session.test.ts
```

Expected: FAIL because `src/context/responses-session.ts` does not exist.

- [ ] **Step 3: Implement responses session resolution**

Create `src/context/responses-session.ts`:

```ts
import type { Logger } from "../logger";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResponseSessionSnapshot } from "../session";
import type { ApplicationContext } from "./application-context";

export async function resolveResponsesSession(
	app: ApplicationContext,
	request: ResponseCreateRequest,
	logger: Logger,
): Promise<ResponseSessionSnapshot | null> {
	if (!request.previous_response_id) return null;
	const session = await app.sessionStore.resolveChain(
		request.previous_response_id,
	);
	logger.debug("session.chain.resolved", () => ({
		previous_response_id: request.previous_response_id,
		turnCount: session.turns.length,
	}));
	return session;
}
```

- [ ] **Step 4: Run the responses session test to verify it passes**

Run:

```bash
bun test src/context/responses-session.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing responses context factory test**

Create `src/context/responses-context-factory.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	ServerError,
} from "../error";
import { Registrar } from "../providers/registrar";
import type { StoredResponseSession } from "../session";
import { ApplicationContext } from "./application-context";
import { createResponsesContext } from "./responses-context-factory";
import { config, createRegistrar } from "./test-fixtures";

function createTestApp(): ApplicationContext {
	return new ApplicationContext(config, createRegistrar());
}

describe("createResponsesContext", () => {
	test("resolves provider-qualified models", async () => {
		const ctx = await createResponsesContext(createTestApp(), {
			model: "zhipu/glm-5.1",
			input: "hi",
		});

		expect(ctx.resolved).toEqual({ provider: "zhipu", model: "glm-5.1" });
		expect(ctx.provider.name).toBe("mock");
		expect(ctx.session).toBeNull();
		expect(ctx.requestId).toMatch(/^req_/);
		expect(ctx.responseId).toMatch(/^resp_/);
	});

	test("uses default_provider for bare model selectors", async () => {
		const ctx = await createResponsesContext(createTestApp(), {
			model: "glm-5.1",
			input: "hi",
		});

		expect(ctx.resolved.provider).toBe("zhipu");
		expect(ctx.resolved.model).toBe("glm-5.1");
	});

	test("propagates missing model ServerError", async () => {
		const err = await createResponsesContext(createTestApp(), {
			model: undefined as never,
			input: "hi",
		}).catch((e) => e);

		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_MISSING_MODEL);
	});

	test("wraps invalid model selector errors", async () => {
		const err = await createResponsesContext(createTestApp(), {
			model: " /glm-5.1",
			input: "hi",
		}).catch((e) => e);

		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
	});

	test("rejects providers missing from config", async () => {
		const err = await createResponsesContext(createTestApp(), {
			model: "openai/gpt-4",
			input: "hi",
		}).catch((e) => e);

		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(SERVER_REQUEST_INVALID_PARAMETER);
		expect((err as ServerError).message).toInclude("Unknown provider");
	});

	test("maps registrar failures to provider-not-registered errors", async () => {
		const app = new ApplicationContext(config, new Registrar());
		const err = await createResponsesContext(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
		}).catch((e) => e);

		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(SERVER_PROVIDER_NOT_REGISTERED);
		expect((err as ServerError).message).toInclude(
			"Provider is not registered",
		);
	});

	test("resolves session chains when previous_response_id is set", async () => {
		const app = createTestApp();
		await app.sessionStore.save({
			id: "resp_prev",
			created_at: 123,
			status: "completed",
			request: { input: "hello" },
			response: { id: "resp_prev", output: [] },
		} as StoredResponseSession);

		const ctx = await createResponsesContext(app, {
			model: "zhipu/glm-5.1",
			input: "hi",
			previous_response_id: "resp_prev",
		});

		expect(ctx.session?.previous_response_id).toBe("resp_prev");
		expect(ctx.session?.turns).toHaveLength(1);
	});
});
```

Run:

```bash
bun test src/context/responses-context-factory.test.ts
```

Expected: FAIL because `src/context/responses-context-factory.ts` does not exist.

- [ ] **Step 6: Implement the responses context factory**

Create `src/context/responses-context-factory.ts`:

```ts
import {
	SERVER_PROVIDER_NOT_REGISTERED,
	SERVER_REQUEST_INVALID_PARAMETER,
	ServerError,
} from "../error";
import type { ResponseCreateRequest } from "../protocol/openai/responses";
import type { ResolvedModel } from "../resolver";
import type { ApplicationContext } from "./application-context";
import { createRequestIdentity } from "./request-identity";
import { ResponsesContext } from "./responses-context";
import { resolveResponsesSession } from "./responses-session";

function resolveRequestModel(
	app: ApplicationContext,
	request: ResponseCreateRequest,
): ResolvedModel {
	try {
		return app.resolver.resolve(request.model);
	} catch (err) {
		if (err instanceof ServerError) throw err;
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			err instanceof Error ? err.message : "Failed to resolve model",
			{ model: String(request.model) },
			{ cause: err instanceof Error ? err : undefined },
		);
	}
}

function assertConfiguredProvider(
	app: ApplicationContext,
	resolved: ResolvedModel,
): void {
	if (app.config.providers[resolved.provider]) return;
	throw new ServerError(
		SERVER_REQUEST_INVALID_PARAMETER,
		`Unknown provider: ${resolved.provider}`,
		{ provider: resolved.provider },
	);
}

export async function createResponsesContext(
	app: ApplicationContext,
	request: ResponseCreateRequest,
): Promise<ResponsesContext> {
	const identity = createRequestIdentity(app.logger);
	const resolved = resolveRequestModel(app, request);
	identity.logger.debug("model.resolved", () => ({
		selector: request.model,
		provider: resolved.provider,
		model: resolved.model,
	}));
	assertConfiguredProvider(app, resolved);
	const session = await resolveResponsesSession(app, request, identity.logger);

	try {
		const provider = app.registrar.resolve(resolved.provider);
		return new ResponsesContext({
			app,
			request,
			session,
			resolved,
			provider,
			requestId: identity.requestId,
			responseId: identity.responseId,
			createdAt: identity.createdAt,
			logger: identity.logger,
		});
	} catch (err) {
		throw new ServerError(
			SERVER_PROVIDER_NOT_REGISTERED,
			`Provider is not registered: ${resolved.provider}`,
			{ provider: resolved.provider },
			{ cause: err instanceof Error ? err : undefined },
		);
	}
}
```

- [ ] **Step 7: Export factory and rerun context factory tests**

Modify `src/context/index.ts`:

```ts
export * from "./application-context";
export * from "./application-services";
export * from "./provider-bootstrap";
export * from "./request-identity";
export * from "./responses-context";
export * from "./responses-context-factory";
export * from "./responses-session";
export * from "./session-store-factory";
export * from "./trace-services";
```

Run:

```bash
bun test src/context/responses-session.test.ts src/context/responses-context-factory.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

Run:

```bash
git add src/context/responses-session.ts src/context/responses-session.test.ts src/context/responses-context-factory.ts src/context/responses-context-factory.test.ts src/context/test-fixtures.ts src/context/index.ts
git commit -m "refactor(context): extract responses context creation"
```

Expected: commit succeeds.

---

### Task 5: Server Integration And Static Factory Removal

**Files:**

- Modify: `src/server/routes/responses/handler.ts`
- Modify: files reported by `rg -n "ResponsesContext\\.create" src`

- [ ] **Step 1: Write the failing static factory removal check**

Run:

```bash
rg -n "ResponsesContext\\.create" src
```

Expected before this task: matches remain in route or test files.

- [ ] **Step 2: Update the responses handler**

Modify `src/server/routes/responses/handler.ts` imports and context creation:

```ts
import type { ApplicationContext } from "../../../context/application-context";
import { createResponsesContext } from "../../../context/responses-context-factory";
import { responseRouteErrorToResponse } from "./error-handler";
import { responseRequestLogEntry } from "./request-log";
import { parseResponseRequest } from "./request-parser";
import { dispatchResponseRequest } from "./response-dispatcher";

export async function handleResponses(
	req: Request,
	app: ApplicationContext,
): Promise<Response> {
	const { logger } = app;

	const parsed = await parseResponseRequest(req, logger);
	if (!parsed.ok) return parsed.response;

	let requestId: string | undefined;
	try {
		const { body } = parsed;
		const ctx = await createResponsesContext(app, body);
		requestId = ctx.requestId;

		ctx.logger.debug("responses.request.received", () =>
			responseRequestLogEntry(body, ctx),
		);
		return await dispatchResponseRequest(ctx, app);
	} catch (err) {
		return responseRouteErrorToResponse(err, app, requestId);
	}
}
```

- [ ] **Step 3: Replace test helper calls to ResponsesContext.create**

Run:

```bash
rg -n "ResponsesContext\\.create" src
```

For each match, replace:

```ts
import { ResponsesContext } from "../../../context/responses-context";
```

with the appropriate relative import:

```ts
import { createResponsesContext } from "../../../context/responses-context-factory";
```

and replace:

```ts
const ctx = await ResponsesContext.create(app, request);
```

with:

```ts
const ctx = await createResponsesContext(app, request);
```

Use `../../context/responses-context-factory` instead of `../../../context/responses-context-factory` when the file is one directory closer to `src/context`.

- [ ] **Step 4: Run route and context tests**

Run:

```bash
bun test src/context src/server/routes/responses
```

Expected: PASS.

- [ ] **Step 5: Verify no static factory usage remains**

Run:

```bash
rg -n "ResponsesContext\\.create" src
```

Expected: no output.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
git add src/server/routes/responses src/context
git commit -m "refactor(context): route through responses context factory"
```

Expected: commit succeeds.

---

### Task 6: Full Cleanup And Verification

**Files:**

- Modify: any file failing typecheck, lint, or tests from the previous tasks.

- [ ] **Step 1: Run context and responses route verification**

Run:

```bash
bun test src/context src/server/routes/responses
```

Expected: PASS.

- [ ] **Step 2: Run module-wide static checks**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run formatter/linter check**

Run:

```bash
bun run lint
```

Expected: PASS.

If Biome reports formatting-only failures, run:

```bash
bun run format
```

Then rerun:

```bash
bun run lint
```

Expected: PASS.

- [ ] **Step 4: Run the full project gate**

Run:

```bash
bun run check
```

Expected: typecheck, lint, and non-e2e test suite all pass.

- [ ] **Step 5: Inspect the final diff for architecture drift**

Run:

```bash
git diff --stat HEAD~5..HEAD
git diff --check
rg -n "ResponsesContext\\.create|new ResponsesContext\\(" src
```

Expected:

- `git diff --check` has no output.
- `ResponsesContext.create` has no output.
- `new ResponsesContext(` appears only in context tests and `responses-context-factory.ts`.

- [ ] **Step 6: Commit final cleanup if any files changed**

If Step 1 through Step 5 required edits, run:

```bash
git add src/context src/server/routes/responses
git commit -m "test(context): verify context module boundaries"
```

Expected: commit succeeds when there are staged changes. If there are no staged changes, skip this commit.

---

## Self-Review

Spec coverage:

- Application service assembly is covered by Tasks 2 and 3.
- Provider registrar bootstrap is covered by Task 3.
- Request identity is covered by Task 1.
- `ResponsesContext` as a data object is covered by Task 1.
- Session chain resolution is covered by Task 4.
- `createResponsesContext()` workflow and error mapping are covered by Task 4.
- Server integration is covered by Task 5.
- Full verification is covered by Task 6.

Placeholder scan:

- The plan contains no placeholder tokens and no undefined future tasks.
- Every code-producing step includes concrete code or a concrete replacement pattern.

Type consistency:

- The plan consistently uses `createResponsesContext()`, `createRequestIdentity()`, `createResponseSessionStore()`, `createTraceServices()`, `createConfiguredRegistrar()`, and `createApplicationServices()`.
- `ResponsesContext` receives one `ResponsesContextInit` object and no longer exposes `ResponsesContext.create()`.
