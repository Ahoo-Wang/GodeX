# Adapter Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/adapter/default-adapter.ts` into focused provider exchange, sync pipeline, stream pipeline, and session persistence boundaries while preserving adapter behavior.

**Architecture:** Keep `DefaultAdapter` as the public `Adapter` implementation. Extract adapter-internal collaborators that own one responsibility each, then move broad `DefaultAdapter` tests to the smallest module that proves the same behavior.

**Tech Stack:** TypeScript strict mode, Bun test runner, Bun Web Streams, existing GodeX trace/session/error/logging utilities, Biome formatting.

---

## File Structure

- Create `src/adapter/response-session-persistence.ts` for `ResponseObject` to `StoredResponseSession` conversion and persistence.
- Create `src/adapter/response-session-persistence.test.ts` for session payload and persistence behavior.
- Create `src/adapter/provider-exchange.ts` for request mapping, prompt-cache analysis, provider trace/logging, and provider client calls.
- Create `src/adapter/provider-exchange.test.ts` for sync and stream upstream exchange behavior.
- Create `src/adapter/sync-request-pipeline.ts` for non-streaming response mapping, usage tracing, completion logging, diagnostics, and session save warnings.
- Create `src/adapter/sync-request-pipeline.test.ts` for sync orchestration behavior.
- Create `src/adapter/stream-pipeline.ts` for stream transformer assembly and upstream latency propagation.
- Create `src/adapter/stream-pipeline.test.ts` for stream pipeline behavior and persistence gating.
- Modify `src/adapter/default-adapter.ts` so it delegates to sync and stream pipelines.
- Modify `src/adapter/default-adapter.test.ts` so it covers only public adapter construction and delegation-level behavior.
- Modify `src/adapter/index.ts` if new adapter-internal modules need local exports for tests or route code.

## Task 1: Response Session Persistence

**Files:**
- Create: `src/adapter/response-session-persistence.test.ts`
- Create: `src/adapter/response-session-persistence.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Cover:

- saving the existing `StoredResponseSession` shape from `ResponseObject` and `ResponsesContext`
- preserving `previous_response_id`
- preserving request replay fields: `input`, `instructions`, `model`, `tools`, `tool_choice`, `parallel_tool_calls`, and `truncation`
- preserving response fields: `id`, `output`, `output_text`, `usage`, `error`, and `incomplete_details`
- skipping persistence when `ctx.request.store === false`
- logging `session.saved` after a successful save
- propagating store errors

- [ ] **Step 2: Run persistence tests to verify RED**

Run:

```bash
bun test src/adapter/response-session-persistence.test.ts
```

Expected: FAIL because `src/adapter/response-session-persistence.ts` does not exist.

- [ ] **Step 3: Implement `saveResponseSession`**

Expose:

```ts
export async function saveResponseSession(
	store: ResponseSessionStore,
	responseObject: ResponseObject,
	ctx: ResponsesContext,
): Promise<void>;
```

Move the existing private `saveSession()` payload construction from `default-adapter.ts` into this function without changing field names or skip semantics.

- [ ] **Step 4: Wire existing adapter calls**

Use `saveResponseSession` in sync request persistence and in `ResponseSessionPersistenceTransformer` options. Keep sync save failure logging inside `DefaultAdapter` until the sync pipeline extraction task.

- [ ] **Step 5: Run targeted adapter tests**

Run:

```bash
bun test src/adapter/response-session-persistence.test.ts src/adapter/default-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapter/response-session-persistence.ts src/adapter/response-session-persistence.test.ts src/adapter/default-adapter.ts src/adapter/default-adapter.test.ts
git commit -m "refactor(adapter): extract session persistence"
```

## Task 2: Provider Exchange

**Files:**
- Create: `src/adapter/provider-exchange.test.ts`
- Create: `src/adapter/provider-exchange.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`

- [ ] **Step 1: Write failing provider exchange tests**

Cover:

- request mapper invocation before client invocation
- prompt-cache analysis and `provider.request.body` trace recording
- sync provider response trace recording
- sync request and response debug logs
- stream connection debug log
- stream latency returned to the caller
- no Responses API response mapping in this layer

- [ ] **Step 2: Run provider exchange tests to verify RED**

Run:

```bash
bun test src/adapter/provider-exchange.test.ts
```

Expected: FAIL because `src/adapter/provider-exchange.ts` does not exist.

- [ ] **Step 3: Implement `ProviderExchange`**

Expose:

```ts
export interface ProviderRequestExchangeResult<ProviderResponse = unknown> {
	providerResponse: ProviderResponse;
}

export interface ProviderStreamExchangeResult {
	mapper: ResponsesContext["provider"]["mapper"];
	providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	upstreamLatencyMillis: number;
}

export class ProviderExchange {
	async request(ctx: ResponsesContext): Promise<ProviderRequestExchangeResult>;
	async stream(ctx: ResponsesContext): Promise<ProviderStreamExchangeResult>;
}
```

Move request mapping, prompt-cache analysis, provider request trace, provider response trace, provider client calls, and provider debug logging out of `DefaultAdapter`.

- [ ] **Step 4: Wire `DefaultAdapter` through `ProviderExchange`**

Use the exchange in both sync and stream paths while keeping response mapping, usage tracing, diagnostics, session save failure handling, and stream transformer assembly in `DefaultAdapter` until the following extraction tasks.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun test src/adapter/provider-exchange.test.ts src/adapter/default-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapter/provider-exchange.ts src/adapter/provider-exchange.test.ts src/adapter/default-adapter.ts src/adapter/default-adapter.test.ts
git commit -m "refactor(adapter): extract provider exchange"
```

## Task 3: Sync Request Pipeline

**Files:**
- Create: `src/adapter/sync-request-pipeline.test.ts`
- Create: `src/adapter/sync-request-pipeline.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`

- [ ] **Step 1: Write failing sync pipeline tests**

Cover:

- provider exchange result mapped through `ctx.provider.mapper.response.map`
- usage trace recording with mapped Responses usage and upstream usage details
- `responses.request.completed` log payload
- compatibility diagnostics logging
- successful session persistence through `saveResponseSession`
- `session.save.error` warning when persistence fails
- response returned when persistence fails

- [ ] **Step 2: Run sync pipeline tests to verify RED**

Run:

```bash
bun test src/adapter/sync-request-pipeline.test.ts
```

Expected: FAIL because `src/adapter/sync-request-pipeline.ts` does not exist.

- [ ] **Step 3: Implement `SyncRequestPipeline`**

Expose:

```ts
export class SyncRequestPipeline {
	constructor(
		private readonly exchange?: ProviderExchange,
		private readonly saveSession?: typeof saveResponseSession,
	);

	request(ctx: ResponsesContext): Promise<ResponseObject>;
}
```

Keep the default constructor path production-ready by creating `ProviderExchange` and using `saveResponseSession` when dependencies are not injected.

- [ ] **Step 4: Wire `DefaultAdapter.request`**

Make `DefaultAdapter.request(ctx)` delegate to `SyncRequestPipeline.request(ctx)`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun test src/adapter/sync-request-pipeline.test.ts src/adapter/default-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapter/sync-request-pipeline.ts src/adapter/sync-request-pipeline.test.ts src/adapter/default-adapter.ts src/adapter/default-adapter.test.ts
git commit -m "refactor(adapter): extract sync request pipeline"
```

## Task 4: Stream Pipeline

**Files:**
- Create: `src/adapter/stream-pipeline.test.ts`
- Create: `src/adapter/stream-pipeline.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`

- [ ] **Step 1: Write failing stream pipeline tests**

Cover:

- returned value is a `ReadableStream<ResponseStreamEvent>`
- raw trace occurs before provider event mapping
- transformed trace occurs after error handling
- response logging sees transformed events
- session persistence transformer is installed only when `request.store !== false`
- compatibility logging remains after persistence/logging
- upstream latency is attached to `ctx.attributes`
- provider read errors before the first chunk still close cleanly
- terminal stream response is persisted before a subsequent upstream read error

- [ ] **Step 2: Run stream pipeline tests to verify RED**

Run:

```bash
bun test src/adapter/stream-pipeline.test.ts
```

Expected: FAIL because `src/adapter/stream-pipeline.ts` does not exist.

- [ ] **Step 3: Implement `StreamPipeline`**

Expose:

```ts
export class StreamPipeline {
	constructor(
		private readonly exchange?: ProviderExchange,
		private readonly saveSession?: typeof saveResponseSession,
	);

	stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}
```

Assemble transformers in the existing order:

```text
provider stream
-> TraceTransformer("upstream.stream.event.raw")
-> ProviderEventToResponseTransformer
-> wrapWithErrorHandler
-> TraceTransformer("upstream.stream.event.transformed")
-> ResponseLogTransformer
-> optional ResponseSessionPersistenceTransformer
-> CompatibilityLogTransformer
```

- [ ] **Step 4: Wire `DefaultAdapter.stream`**

Make `DefaultAdapter.stream(ctx)` delegate to `StreamPipeline.stream(ctx)`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun test src/adapter/stream-pipeline.test.ts src/adapter/default-adapter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/adapter/stream-pipeline.ts src/adapter/stream-pipeline.test.ts src/adapter/default-adapter.ts src/adapter/default-adapter.test.ts
git commit -m "refactor(adapter): extract stream pipeline"
```

## Task 5: Adapter Facade Cleanup

**Files:**
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`
- Modify: `src/adapter/index.ts` if exports are needed

- [ ] **Step 1: Narrow facade tests**

Keep `DefaultAdapter` tests focused on:

- default construction returns a working sync response through production collaborators
- default construction returns a working stream through production collaborators
- injected sync and stream pipelines are delegated to exactly once

- [ ] **Step 2: Run facade tests**

Run:

```bash
bun test src/adapter/default-adapter.test.ts
```

Expected: PASS after broad assertions have moved to focused tests.

- [ ] **Step 3: Remove stale adapter responsibilities**

Ensure `default-adapter.ts` no longer imports trace utilities, stream transformers, session store types, `recordTraceUsage`, or `logDiagnostics` directly.

- [ ] **Step 4: Run adapter test group**

Run:

```bash
bun test src/adapter
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/adapter
git commit -m "refactor(adapter): slim default adapter facade"
```

## Task 6: Full Verification

**Files:**
- Review: `src/adapter/default-adapter.ts`
- Review: `src/adapter/provider-exchange.ts`
- Review: `src/adapter/response-session-persistence.ts`
- Review: `src/adapter/sync-request-pipeline.ts`
- Review: `src/adapter/stream-pipeline.ts`

- [ ] **Step 1: Run full check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 2: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 3: Review final diff**

Run:

```bash
git diff --stat HEAD~5..HEAD
git status --short --branch
```

Expected: adapter-focused production and test changes only, clean worktree.
