# Server Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the `/v1/responses` route into focused server units while preserving external behavior except for an intentional malformed-body validation hardening found during review.

**Architecture:** Keep `handleResponses(req, app)` as the public route entrypoint. Extract request parsing, request log metadata, sync/stream dispatch, and route error handling into route-local modules with focused tests.

**Tech Stack:** TypeScript strict mode, Bun test runner, Bun Web APIs, existing GodeX error hierarchy, existing SSE transformer utilities.

---

## File Structure

- Create `src/server/routes/responses/request-parser.ts` for JSON parsing and route-level request validation.
- Create `src/server/routes/responses/request-log.ts` for `responses.request.received` metadata.
- Create `src/server/routes/responses/response-dispatcher.ts` for sync/stream adapter dispatch.
- Create `src/server/routes/responses/error-handler.ts` for route error logging and JSON error responses.
- Create `src/server/routes/responses/test-fixtures.ts` for route-local test fixtures.
- Replace the large `src/server/routes/responses/responses.test.ts` with focused tests:
  - `request-parser.test.ts`
  - `request-log.test.ts`
  - `response-dispatcher.test.ts`
  - `error-handler.test.ts`
  - `handler.test.ts`
- Modify `src/server/routes/responses/handler.ts` so it only orchestrates the extracted units.

### Task 1: Request Parser

**Files:**
- Create: `src/server/routes/responses/request-parser.ts`
- Create: `src/server/routes/responses/request-parser.test.ts`

- [ ] **Step 1: Write failing parser tests**

Cover:

- invalid JSON returns a 400 `server.request.invalid_json` response
- valid JSON bodies that are not objects return a 400 `server.request.invalid_parameter` response
- conflicting `previous_response_id` and `conversation` returns a 400 `server.request.invalid_parameter` response
- valid JSON returns the parsed `ResponseCreateRequest`

- [ ] **Step 2: Run parser tests to verify failure**

Run: `bun test src/server/routes/responses/request-parser.test.ts`

Expected: imports fail because `request-parser.ts` does not exist.

- [ ] **Step 3: Implement parser**

Expose:

```ts
export type ParseResponseRequestResult =
	| { ok: true; body: ResponseCreateRequest }
	| { ok: false; response: Response };

export async function parseResponseRequest(
	req: Request,
	logger: Logger,
): Promise<ParseResponseRequestResult>;
```

- [ ] **Step 4: Run parser tests**

Run: `bun test src/server/routes/responses/request-parser.test.ts`

Expected: all parser tests pass.

### Task 2: Request Log Metadata

**Files:**
- Create: `src/server/routes/responses/request-log.ts`
- Create: `src/server/routes/responses/request-log.test.ts`

- [ ] **Step 1: Write failing log metadata tests**

Cover:

- snake_case metadata fields
- array input count, single input count, and empty input count
- optional request fields currently logged by `handler.ts`

- [ ] **Step 2: Run log tests to verify failure**

Run: `bun test src/server/routes/responses/request-log.test.ts`

Expected: imports fail because `request-log.ts` does not exist.

- [ ] **Step 3: Implement log metadata builder**

Expose:

```ts
export function responseRequestLogEntry(
	body: ResponseCreateRequest,
	ctx: ResponsesContext,
): Record<string, unknown>;
```

- [ ] **Step 4: Run log tests**

Run: `bun test src/server/routes/responses/request-log.test.ts`

Expected: all log metadata tests pass.

### Task 3: Response Dispatcher

**Files:**
- Create: `src/server/routes/responses/response-dispatcher.ts`
- Create: `src/server/routes/responses/response-dispatcher.test.ts`

- [ ] **Step 1: Write failing dispatch tests**

Cover:

- non-stream requests call `adapter.request`
- stream requests call `adapter.stream`
- stream responses use SSE headers and encode SSE frames

- [ ] **Step 2: Run dispatch tests to verify failure**

Run: `bun test src/server/routes/responses/response-dispatcher.test.ts`

Expected: imports fail because `response-dispatcher.ts` does not exist.

- [ ] **Step 3: Implement dispatcher**

Expose:

```ts
export async function dispatchResponseRequest(
	ctx: ResponsesContext,
	app: ApplicationContext,
): Promise<Response>;
```

- [ ] **Step 4: Run dispatch tests**

Run: `bun test src/server/routes/responses/response-dispatcher.test.ts`

Expected: all dispatch tests pass.

### Task 4: Route Error Handler

**Files:**
- Create: `src/server/routes/responses/error-handler.ts`
- Create: `src/server/routes/responses/error-handler.test.ts`

- [ ] **Step 1: Write failing error handler tests**

Cover:

- `ProviderError` mapping and log event
- `GodeXError` mapping and log event
- unknown error mapping and log event
- `x-request-id` header propagation

- [ ] **Step 2: Run error handler tests to verify failure**

Run: `bun test src/server/routes/responses/error-handler.test.ts`

Expected: imports fail because `error-handler.ts` does not exist.

- [ ] **Step 3: Implement error handler**

Expose:

```ts
export function responseRouteErrorToResponse(
	err: unknown,
	app: ApplicationContext,
	requestId?: string,
): Response;
```

- [ ] **Step 4: Run error handler tests**

Run: `bun test src/server/routes/responses/error-handler.test.ts`

Expected: all error handler tests pass.

### Task 5: Handler Orchestration And Test Split

**Files:**
- Modify: `src/server/routes/responses/handler.ts`
- Create: `src/server/routes/responses/handler.test.ts`
- Create: `src/server/routes/responses/test-fixtures.ts`
- Delete: `src/server/routes/responses/responses.test.ts`

- [ ] **Step 1: Write handler orchestration tests**

Cover representative full-route behavior:

- valid non-stream request returns a response object
- invalid model selector maps to request error
- stream setup errors preserve current empty-body behavior
- completed stream errors are not logged again after SSE completion

- [ ] **Step 2: Run handler tests**

Run: `bun test src/server/routes/responses/handler.test.ts`

Expected: initially fails until `handler.ts` delegates to extracted modules and helpers are in place.

- [ ] **Step 3: Refactor handler**

Make `handleResponses()`:

1. call `parseResponseRequest`
2. return parser error responses immediately
3. create `ResponsesContext`
4. log `responseRequestLogEntry`
5. call `dispatchResponseRequest`
6. catch errors through `responseRouteErrorToResponse`

- [ ] **Step 4: Remove old monolithic test**

Delete `responses.test.ts` after focused tests cover the same behavior.

- [ ] **Step 5: Run focused response route tests**

Run: `bun test src/server/routes/responses`

Expected: all response route tests pass.

### Task 6: Full Verification

**Files:**
- All files above

- [ ] **Step 1: Run server tests**

Run: `bun test src/server`

Expected: all server tests pass.

- [ ] **Step 2: Run full project check**

Run: `bun run check`

Expected: typecheck, lint, and tests pass.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add -A
git add -f docs/superpowers/plans/2026-05-27-server-module-refactor.md
git commit -m "Refactor responses route responsibilities"
```
