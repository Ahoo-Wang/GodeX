# Server Module Refactor Design

## Goal

Refactor the server `responses` route so request handling responsibilities are explicit, tests are easier to navigate, and future route behavior can be extended without growing a monolithic handler.

The refactor keeps the external HTTP API stable except for one intentional request-validation hardening found during review: valid JSON bodies that are not objects now return a controlled `server.request.invalid_parameter` response instead of falling through to later context creation or throwing an unhandled error. The main work remains an internal cleanup focused on readability, cohesion, low coupling, and test clarity.

## Current State

`src/server` is already small and has clear top-level routes:

- `server.ts` wires Bun routes and startup logging.
- `errors.ts` maps domain errors to HTTP JSON responses.
- `routes/health.ts` and `routes/models.ts` are focused.
- `routes/responses/handler.ts` handles the main `/v1/responses` endpoint.

The technical debt is concentrated in `routes/responses`:

- `handler.ts` parses JSON, validates parameter conflicts, creates `ResponsesContext`, builds request log metadata, dispatches sync and stream requests, encodes SSE, and maps errors.
- `responses.test.ts` is more than 600 lines and mixes request logging, validation, model errors, stream setup errors, stream body behavior, and provider error mapping.
- The handler imports low-level stream encoding details directly, making the route entrypoint less declarative than the health and models routes.

## Approaches Considered

### 1. Test-Only Split

Split `responses.test.ts` into several test files while leaving production code as-is.

This improves navigation but does not remove the real production boundary problem. The handler would still be the single place where unrelated route concerns accumulate.

### 2. Focused Responses Route Decomposition

Keep `handleResponses(req, app)` as the public route entrypoint, then extract focused helpers for request parsing, request logging, response dispatch, and route error handling.

This directly addresses the current debt without changing server contracts or adapter behavior. The only observable route change is the explicit malformed-body validation described above. It also keeps the refactor local to `src/server/routes/responses`.

### 3. Broad Server Framework Abstraction

Introduce a generic route abstraction for all endpoints, such as typed route definitions, middleware, and shared request lifecycle hooks.

This may become useful later if the server surface grows. It is too broad for the current codebase: there are only three routes, and health/models do not need extra framework shape.

## Selected Design

Use approach 2.

The production `responses` route should become a small orchestration layer:

```text
src/server/routes/responses/
├── error-handler.ts
├── handler.ts
├── index.ts
├── request-log.ts
├── request-parser.ts
├── response-dispatcher.ts
└── sse.ts
```

### `request-parser.ts`

Owns HTTP request body parsing and route-level request validation:

```ts
async function parseResponseRequest(
	req: Request,
	logger: Logger,
): Promise<ParseResponseRequestResult>;
```

It should:

- parse JSON into `ResponseCreateRequest`
- log invalid JSON as `responses.request.invalid_json`
- reject valid JSON bodies that are not objects before context creation
- reject `previous_response_id` plus `conversation` before session resolution
- return either a valid body or a ready HTTP error `Response`

It should not create `ResponsesContext`, resolve models, call the adapter, or know about SSE.

### `request-log.ts`

Owns request metadata shape for `responses.request.received`:

```ts
function responseRequestLogEntry(
	body: ResponseCreateRequest,
	ctx: ResponsesContext,
): Record<string, unknown>;
```

This keeps log field names explicit and testable, including snake_case fields such as `input_count` and `previous_response_id`.

### `response-dispatcher.ts`

Owns sync versus stream adapter dispatch:

```ts
async function dispatchResponseRequest(
	ctx: ResponsesContext,
	app: ApplicationContext,
): Promise<Response>;
```

It should:

- call `app.adapter.stream(ctx)` when `ctx.request.stream` is truthy
- encode stream events through `ResponseSseEncodeTransformer`
- return `sseHeaders()` for stream responses
- call `app.adapter.request(ctx)` and return `Response.json(...)` for non-stream responses

It should not parse JSON, validate request conflicts, or map thrown errors.

### `error-handler.ts`

Owns route error logging and HTTP error response conversion:

```ts
function responseRouteErrorToResponse(
	err: unknown,
	app: ApplicationContext,
	requestId?: string,
): Response;
```

It should preserve current behavior:

- `ProviderError` logs `responses.request.provider.error` at error level and uses `providerErrorToHttp`.
- `GodeXError` logs `responses.request.error` at info level and uses the error status/code/message.
- unknown errors log `godex.unexpected.error` at error level and return `SERVER_ERROR`.
- `x-request-id` is attached when available.

### `handler.ts`

Keeps the stable public entrypoint:

```ts
export async function handleResponses(
	req: Request,
	app: ApplicationContext,
): Promise<Response>;
```

Its responsibilities become:

1. parse and validate the route request
2. create `ResponsesContext`
3. log `responses.request.received`
4. dispatch sync or stream response
5. delegate errors to `responseRouteErrorToResponse`

## Test Design

Split tests by responsibility:

```text
src/server/routes/responses/
├── error-handler.test.ts
├── handler.test.ts
├── request-log.test.ts
├── request-parser.test.ts
└── response-dispatcher.test.ts
```

Shared test helpers can live in:

```text
src/server/routes/responses/test-fixtures.ts
```

This helper is route-test-local and is not exported from the public server barrel.

### Coverage Targets

`request-parser.test.ts`:

- invalid JSON returns `server.request.invalid_json`
- non-object JSON bodies return `server.request.invalid_parameter`
- `previous_response_id` plus `conversation` returns `server.request.invalid_parameter`
- valid JSON returns the parsed body

`request-log.test.ts`:

- emits snake_case fields
- counts array input, single input, and empty input
- includes provider/model resolution and optional request metadata

`response-dispatcher.test.ts`:

- non-stream requests call `adapter.request`
- stream requests call `adapter.stream`
- stream responses are encoded as SSE and use SSE headers

`error-handler.test.ts`:

- provider rate limits, timeouts, upstream 5xx, and other provider errors keep existing HTTP mapping
- `GodeXError` preserves status/code/message
- unknown errors return internal server error and include request id when available

`handler.test.ts`:

- verifies the full route orchestration for representative success and failure paths
- covers context creation errors such as invalid model selectors
- does not duplicate every unit-level parser, dispatcher, or error mapping case

## Out Of Scope

- Changing `/v1/responses` request or response behavior beyond the explicit non-object JSON body validation hardening
- Changing `ResponsesContext`
- Changing `ApplicationContext`
- Changing adapter stream transformers or stream terminal semantics
- Changing `src/server/errors.ts` behavior beyond import cleanup if necessary
- Adding a generic routing framework
- Changing config schema or CLI behavior

## Acceptance Criteria

- `handler.ts` is a small route orchestration function with no low-level SSE or HTTP error mapping details.
- Request parsing, request logging, dispatch, and error mapping each have focused tests.
- The large `responses.test.ts` is removed or reduced to orchestration-level coverage.
- Existing route behavior remains covered, including invalid JSON, malformed non-object JSON bodies, parameter conflict, invalid model selectors, stream setup behavior, and provider error mapping.
- `bun run check` passes.
