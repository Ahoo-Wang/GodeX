# Context Module Refactor Design

## Goal

Refactor `src/context` so application-level dependency assembly and per-request context creation have explicit, testable boundaries.

This is an internal architecture cleanup. The external HTTP behavior stays stable, but the internal API does not need to preserve accidental compatibility. In particular, `ResponsesContext.create()` can be replaced by a focused factory function if that leaves the module cleaner.

The desired outcome is high cohesion, low coupling, and tests that prove each boundary independently instead of relying on two broad context test files.

## Current State

`src/context` currently has only two production files:

- `application-context.ts`
- `responses-context.ts`

Those files carry more responsibility than their size suggests.

`ApplicationContext` currently:

- creates logging
- creates model resolution
- creates and registers providers
- creates the adapter
- creates memory or SQLite session storage
- creates trace and prompt-cache services
- owns close ordering for trace and session resources

`ResponsesContext.create()` currently:

- creates request and response IDs
- creates a child logger
- resolves the model selector
- wraps model resolution failures into request errors
- verifies that the resolved provider exists in config
- resolves previous response session chains
- resolves the registered provider instance
- constructs the request context

The module is still readable, but the responsibilities are tightly packed. Every new dependency added to `ApplicationContext` or every new per-request step added to `ResponsesContext.create()` makes those two files wider and their tests less focused.

## Approaches Considered

### 1. Small Helper Extraction

Move a few private helper functions out of the two files while preserving the existing shape, including `ResponsesContext.create()`.

This is low risk, but it mostly moves code around. The central context files would still be the place where unrelated assembly and request-resolution behavior accumulates.

### 2. Focused Context Factories

Split application service assembly and response-context creation into dedicated module-local factories:

- session store factory
- trace services factory
- provider registrar bootstrap
- request identity factory
- model/session/provider resolution helpers
- response context factory

`ApplicationContext` becomes the application container and lifecycle owner. `ResponsesContext` becomes the request data object. Creation logic moves to named factory functions.

This removes the current mixed responsibilities while keeping the change local to `src/context` plus the server import that creates request contexts.

### 3. Generic Dependency Injection Container

Introduce a DI container or service registry abstraction and have application setup register all services through that container.

This would be flexible, but it is too broad for the current project. GodeX has a small, explicit dependency graph. A generic container would add indirection without solving a concrete need.

## Selected Design

Use approach 2.

The refactored module should look like this:

```text
src/context/
├── application-context.ts
├── application-services.ts
├── index.ts
├── provider-bootstrap.ts
├── request-identity.ts
├── responses-context.ts
├── responses-context-factory.ts
├── responses-session.ts
├── session-store-factory.ts
└── trace-services.ts
```

File names can be adjusted during implementation if a clearer local pattern emerges, but each responsibility should stay separate.

### `application-context.ts`

Owns the application container and lifecycle only.

It should expose the same runtime service properties that consumers actually use:

- `config`
- `logger`
- `resolver`
- `registrar`
- `adapter`
- `sessionStore`
- `traceRecorder`
- `promptCacheRequestAnalyzer`
- `promptCacheDetector`
- `promptCacheObservationIndex`
- `traceEnabled`

Its constructor should delegate service construction to `createApplicationServices(config, registrar?)`.

Its `close()` method remains the lifecycle owner:

1. close the trace recorder if it supports `close`
2. log trace close failures as `trace.close.error`
3. close the session store if it supports `close`

Session close failures are still allowed to propagate as they do today. This keeps the refactor behavior-compatible while leaving room for a later lifecycle policy change.

### `application-services.ts`

Owns dependency assembly for `ApplicationContext`.

```ts
interface ApplicationServices {
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

function createApplicationServices(
	config: GodeXConfig,
	registrar?: Registrar,
): ApplicationServices;
```

This function is orchestration only. Concrete creation logic belongs in focused helpers.

### `session-store-factory.ts`

Owns config-to-session-store assembly:

```ts
function createResponseSessionStore(
	config: SessionConfig,
): ResponseSessionStore;
```

It chooses memory or SQLite and resolves the default SQLite path. `ApplicationContext` should not know those details.

### `trace-services.ts`

Owns trace and prompt-cache service assembly:

```ts
interface TraceServices {
	traceEnabled: boolean;
	traceRecorder: TraceRecorder;
	promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer;
	promptCacheDetector: PromptCacheDetector;
	promptCacheObservationIndex: PromptCacheObservationIndex;
}

function createTraceServices(
	config: TraceConfig,
	logger: Logger,
): TraceServices;
```

It should contain the current enabled/disabled branch:

- disabled trace creates `NoopTraceRecorder`
- enabled trace creates `SQLiteTraceStore` and `AsyncTraceRecorder`
- prompt-cache analyzer, detector, and LRU observation index are created here

The LRU size rule remains `Math.max(1000, config.max_queue_size)`.

### `provider-bootstrap.ts`

Owns provider registrar setup:

```ts
function createConfiguredRegistrar(
	providers: GodeXConfig["providers"],
	logger: Logger,
	registrar?: Registrar,
): Registrar;
```

It should use the supplied registrar when tests or callers provide one; otherwise it creates the built-in registrar. It then registers configured providers exactly once.

This isolates provider bootstrap from the application container and makes the custom-registrar test target precise.

### `responses-context.ts`

Becomes the request context data object.

It should retain:

- request IDs and timestamps
- scoped logger
- request body
- resolved model
- resolved provider
- optional session snapshot
- diagnostics collection
- mutable attributes map

It should no longer own the full creation workflow. The static `create()` method should be removed if server and tests can use `createResponsesContext()` directly. Keeping a static forwarding method only to preserve the old shape would be compatibility baggage.

The constructor can accept a single explicit initialization object to avoid positional argument drift:

```ts
interface ResponsesContextInit {
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
```

### `request-identity.ts`

Owns request identity creation:

```ts
interface RequestIdentity {
	requestId: string;
	responseId: string;
	createdAt: number;
	logger: Logger;
}

function createRequestIdentity(logger: Logger): RequestIdentity;
```

It creates `req_` and `resp_` IDs with `nanoid`, calculates Unix `createdAt`, and creates the scoped child logger with `request_id` and `response_id`.

Tests should assert ID prefixes, positive timestamp, and child logger creation without needing model or provider setup.

### `responses-session.ts`

Owns previous-response session resolution for request context creation:

```ts
function resolveResponsesSession(
	app: ApplicationContext,
	request: ResponseCreateRequest,
	logger: Logger,
): Promise<ResponseSessionSnapshot | null>;
```

It should:

- return `null` when no `previous_response_id` is present
- call `app.sessionStore.resolveChain()` when present
- log `session.chain.resolved` with `previous_response_id` and `turnCount`
- let `SessionError` and unexpected session-store errors propagate unchanged

The goal is to keep session behavior independent from model/provider resolution.

### `responses-context-factory.ts`

Owns the per-request creation workflow:

```ts
async function createResponsesContext(
	app: ApplicationContext,
	request: ResponseCreateRequest,
): Promise<ResponsesContext>;
```

The flow should be:

1. create request identity
2. resolve the model selector through `app.resolver`
3. log `model.resolved`
4. verify resolved provider exists in `app.config.providers`
5. resolve previous response session
6. resolve provider instance through `app.registrar`
7. construct `ResponsesContext`

Model resolution failures keep the current error semantics:

- existing `ServerError` propagates
- non-`ServerError` failures are wrapped as `SERVER_REQUEST_INVALID_PARAMETER`

Provider config failures keep current behavior:

- provider missing from config throws `SERVER_REQUEST_INVALID_PARAMETER`

Registrar failures keep current behavior:

- provider not registered throws `SERVER_PROVIDER_NOT_REGISTERED`
- the original error is preserved as cause when it is an `Error`

## Server Integration

`src/server/routes/responses/handler.ts` should import `createResponsesContext` instead of calling `ResponsesContext.create()`.

No HTTP route behavior should change. The handler still:

- parses the request
- creates the request context
- logs `responses.request.received`
- dispatches sync or stream work
- delegates errors to the route error handler

## Test Design

Split context tests by responsibility:

```text
src/context/
├── application-context.test.ts
├── application-services.test.ts
├── provider-bootstrap.test.ts
├── request-identity.test.ts
├── responses-context.test.ts
├── responses-context-factory.test.ts
├── responses-session.test.ts
├── session-store-factory.test.ts
└── trace-services.test.ts
```

Not every file must be large. The point is that each behavior has a clear home.

### Coverage Targets

`session-store-factory.test.ts`:

- creates memory store for memory config
- creates SQLite store for configured SQLite path
- falls back to default SQLite path when missing

`trace-services.test.ts`:

- disabled trace creates noop recorder and prompt-cache services
- enabled trace creates async recorder services
- observation index size respects the minimum size rule

`provider-bootstrap.test.ts`:

- built-in registrar is created when none is supplied
- supplied registrar is reused
- configured providers are registered once
- unsupported providers remain reported through registrar behavior

`application-services.test.ts`:

- composes all application services from config
- passes logger to provider bootstrap and trace service creation through observable behavior

`application-context.test.ts`:

- stores config and created services
- delegates close to trace recorder and session store
- logs trace close failures

`request-identity.test.ts`:

- creates `req_` and `resp_` IDs
- creates positive Unix timestamp
- creates child logger with request and response bindings

`responses-session.test.ts`:

- returns null without `previous_response_id`
- resolves and logs a session chain
- propagates `SessionError`

`responses-context.test.ts`:

- stores constructor-provided app/request/session/resolved/provider fields
- starts with empty diagnostics
- supports `addDiagnostic`
- starts with an empty mutable attributes map

`responses-context-factory.test.ts`:

- resolves provider-qualified and default-provider models
- wraps invalid model selector errors
- rejects providers missing from config
- maps registrar failures to `SERVER_PROVIDER_NOT_REGISTERED`
- resolves session chains when requested
- returns context with generated identity and provider

Existing server route tests should continue to cover route orchestration; they should not duplicate all context factory cases.

## Out Of Scope

- Changing external HTTP request or response behavior
- Changing `GodeXConfig`
- Changing `ModelResolver`
- Changing `Registrar`
- Changing provider factories
- Changing adapter, mapper, or stream contracts
- Changing session chain behavior
- Changing trace persistence behavior
- Introducing a DI container or runtime dependency

## Acceptance Criteria

- `ApplicationContext` no longer directly constructs session, trace, prompt-cache, provider registrar, or adapter services inline.
- `ResponsesContext` no longer owns request-context creation workflow.
- Server creates request contexts through `createResponsesContext()`.
- Context tests are split by responsibility and cover the new factory boundaries.
- No static forwarding API is kept only for compatibility with the old internal shape.
- `bun test src/context src/server/routes/responses` passes.
- `bun run check` passes.
