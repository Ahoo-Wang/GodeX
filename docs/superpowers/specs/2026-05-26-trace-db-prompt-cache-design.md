# Trace DB and Prompt Cache Detection Design

## Goal

Add a disabled-by-default trace database and prompt cache detection capability to GodeX so operators can observe and verify that GodeX does not break provider prompt cache strategies.

The feature must not block `/v1/responses`, must not change provider request semantics, and must not expose any new HTTP API.

## Current Evidence

- `DefaultAdapter` currently writes payload-level trace data through `ctx.logger.trace(...)` for Responses requests, mapped upstream requests, upstream responses, and stream events.
- `TraceTransformer` currently observes stream chunks and must continue to pass every chunk through unchanged.
- `ResponseUsage` already supports OpenAI-style `input_tokens_details.cached_tokens`.
- OpenAI provider request mapping already forwards `prompt_cache_key`, `prompt_cache_retention`, and `safety_identifier`.
- Session persistence already uses `bun:sqlite`, but trace data needs its own SQLite database and schema.

## Non-Goals

- Do not add `/v1/godex/*` or any other internal HTTP route.
- Do not auto-generate `prompt_cache_key`.
- Do not add Anthropic `cache_control`.
- Do not inject trace IDs, request IDs, timestamps, or metadata into prompts, messages, tools, or provider requests.
- Do not reorder messages, tools, system/developer content, or provider request fields.
- Do not change Provider, ProviderMapper, RequestMapper, ResponseMapper, or StreamMapper public contracts.
- Do not make trace durability part of request success semantics.

## Configuration

Add a `trace` config section:

```yaml
trace:
  enabled: false
  path: ./data/trace.db
  max_queue_size: 10000
  flush_interval_ms: 1000
  batch_size: 100
  capture_payload: false
  payload_max_bytes: 65536
```

Defaults:

- `enabled`: `false`
- `path`: `./data/trace.db` in development, `~/.godex/data/trace.db` outside development
- `max_queue_size`: `10000`
- `flush_interval_ms`: `1000`
- `batch_size`: `100`
- `capture_payload`: `false`
- `payload_max_bytes`: `65536`

When trace is disabled, `ApplicationContext` uses `NoopTraceRecorder`. When trace is enabled, it creates a separate `SQLiteTraceStore`, `AsyncTraceRecorder`, `ChatCompletionPromptCacheRequestAnalyzer`, and `PrefixPromptCacheDetector`.

## Architecture

### Application Context Ownership

`ApplicationContext` is the dependency root for trace and cache detection:

- `traceRecorder: TraceRecorder`
- `promptCacheRequestAnalyzer: ProviderPromptCacheRequestAnalyzer`
- `promptCacheDetector: PromptCacheDetector`
- `promptCacheObservationIndex: PromptCacheObservationIndex`

`DefaultAdapter` keeps its current zero-argument constructor and reaches these components through `ctx.app`. This avoids changing the public `Adapter` interface and keeps the existing `new DefaultAdapter()` construction path intact.

`TraceTransformer` also receives only `(eventName, ctx)` and records through `ctx.app.traceRecorder`. Its constructor shape can stay stable while the implementation changes from logger trace calls to trace recorder calls.

`ResponsesContext.requestId` and `ResponsesContext.responseId` are the source for every `request_id` and `response_id` column. They already use the `req_${nanoid()}` and `resp_${nanoid()}` formats.

### Trace Recorder

`TraceRecorder` is the only recording API used by adapter code.

```ts
export interface TraceRecorder {
	record(event: TraceRecordEvent): void;
	close?(): void | Promise<void>;
}
```

`TraceRecordEvent` is a discriminated union. It is the contract between adapter/transformer code and the recorder.

```ts
export type TraceRecordEvent =
	| TraceRequestRecordEvent
	| TraceUsageRecordEvent
	| TraceEventRecordEvent;

export interface TraceRecordBase {
	request_id: string;
	response_id: string;
	provider: string;
	model: string;
	/** Unix milliseconds when this trace record was observed/enqueued. */
	created_at: number;
}

export interface TracePayloadInput {
	payload?: unknown;
	payload_hash?: string;
	payload_bytes?: number;
}

export interface TraceRequestRecordEvent extends TraceRecordBase {
	kind: "request";
	stream: boolean;
	requested_prompt_cache_key?: string;
	requested_prompt_cache_retention?: string;
	prompt_cache_key?: string;
	prompt_cache_retention?: string;
	cache_detection?: PromptCacheDetection;
	payload?: TracePayloadInput;
}

export interface TraceUsageRecordEvent extends TraceRecordBase {
	kind: "usage";
	usage: TraceUsageSnapshot;
	raw_usage?: unknown;
}

export interface TraceEventRecordEvent extends TraceRecordBase {
	kind: "event";
	event_name:
		| "provider.request.body"
		| "provider.response.body"
		| "upstream.stream.event.raw"
		| "upstream.stream.event.transformed";
	sequence?: number;
	payload?: TracePayloadInput;
}

export interface TraceUsageSnapshot {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	cached_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}
```

The recorder converts `kind: "request"` events into `trace_requests`, `kind: "usage"` events into `trace_usage`, and `kind: "event"` events into `trace_events`. `TracePayloadInput.payload` is summarized according to the payload capture policy inside the recorder, so adapter code does not duplicate serialization or truncation rules.

All trace `created_at` values use Unix milliseconds from the moment the trace record is observed or enqueued. They are trace timestamps, not Responses API `created_at` values. This means `trace_requests.created_at`, `trace_events.created_at`, and `trace_usage.created_at` each describe when that specific trace row was produced.

`record()` must:

- return synchronously
- never be awaited by callers
- never throw
- avoid SQLite writes in the request path
- warn and drop records when the queue is full
- warn and drop records when payload serialization fails

`AsyncTraceRecorder` owns an in-memory bounded queue and flushes batches to `SQLiteTraceStore` on a timer or when the queue reaches `batch_size`. SQLite failures are caught and logged as warnings without retrying inside the request path.

`NoopTraceRecorder` implements the same interface and drops all events.

### Observation Index

`PromptCacheObservationIndex` owns the in-memory history used by `PrefixPromptCacheDetector`.

```ts
export interface PromptCacheObservation {
	provider: string;
	model: string;
	/** Cache identity key; prefer requested_prompt_cache_key, then provider-side prompt_cache_key. */
	cache_identity_key: string;
	prefix_hash: string;
	prefix_bytes: number;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	/** Unix milliseconds when this observation was remembered. */
	created_at: number;
	request_id: string;
}

export interface PromptCacheObservationIndex {
	get(input: {
		provider: string;
		model: string;
		cache_identity_key?: string;
	}): PromptCacheObservation | null;
	remember(observation: PromptCacheObservation): void;
}
```

`ApplicationContext` creates this index. `DefaultAdapter` reads the previous observation before calling the detector, then calls `remember()` after detection using the current analysis result. The index does not query SQLite in the request path.

The first implementation should use a bounded LRU-style map with a default maximum equal to `trace.max_queue_size`, capped to a reasonable floor of at least 1,000 entries. When the bound is reached, the oldest observations are evicted. This keeps repeated cache-key detection useful without allowing unbounded memory growth.

Observations are tracked only when a cache identity key exists. The cache identity key is `requested_prompt_cache_key` when the original Responses request provided it; otherwise it is the provider-side `prompt_cache_key` if one exists. Requests without either key still get prefix hash and heuristic detection, but they do not enter the cache-key observation index.

### SQLite Trace Store

`SQLiteTraceStore` uses `bun:sqlite` and is independent from the session SQLite store. It owns migration and batch insert behavior for:

- `trace_requests`
- `trace_usage`
- `trace_events`

It may share implementation style with `SQLiteResponseSessionStore`, but it must not reuse session tables.

The first implementation uses constructor-time `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`, matching the current session SQLite style. It does not add a migration version table yet. Future schema changes can introduce explicit schema versioning when there is a second trace schema version to migrate from.

### Prompt Cache Analysis

Split provider request parsing from cache risk detection.

```ts
export interface ProviderPromptCacheRequestAnalyzer<TProviderRequest = unknown> {
	analyze(input: {
		provider: string;
		model: string;
		request: ResponseCreateRequest;
		providerRequest: TProviderRequest;
	}): PromptCacheAnalysisInput;
}
```

`ProviderPromptCacheRequestAnalyzer` extracts provider-neutral cache analysis data from the mapped provider request. The default implementation is `ChatCompletionPromptCacheRequestAnalyzer`, because current providers map Responses requests to Chat Completions-shaped provider requests.

`PromptCacheDetector` consumes analyzer output and prior observations only.

```ts
export interface PromptCacheDetector {
	detect(input: {
		current: PromptCacheAnalysisInput;
		previous?: PromptCacheObservation | null;
	}): PromptCacheDetection;
}
```

This keeps provider request shape knowledge out of the detector.

## Prompt Cache Analysis Data

`PromptCacheAnalysisInput` contains only detection inputs:

```ts
export interface PromptCacheAnalysisInput {
	provider: string;
	model: string;
	/** From original Responses request: what the caller asked GodeX to preserve. */
	requested_prompt_cache_key?: string;
	requested_prompt_cache_retention?: string;
	/** From mapped provider request: what GodeX will actually send upstream. */
	prompt_cache_key?: string;
	prompt_cache_retention?: string;
	has_cache_control?: boolean;
	prefix_parts: Array<{
		kind: "instruction" | "system" | "developer" | "message" | "tool";
		role?: string;
		name?: string;
		bytes: number;
		hash: string;
	}>;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	static_prefix_hash: string;
	static_prefix_bytes: number;
	dynamic_text_candidates: Array<{
		source: "instructions" | "message";
		role?: string;
		text: string;
	}>;
}
```

The analyzer must preserve original provider request order. It may hash and summarize request parts, but it must not normalize by sorting or otherwise hide ordering changes that can affect prompt cache behavior.

The analyzer also records both sides of cache passthrough. `requested_prompt_cache_key` and `requested_prompt_cache_retention` come from the original Responses request. `prompt_cache_key` and `prompt_cache_retention` come from the mapped provider request. The detector uses these paired fields to detect cases where the caller supplied cache fields but the provider request did not preserve them.

## Prefix Prompt Cache Detector

`PrefixPromptCacheDetector` is the default detector. It produces:

```ts
export interface PromptCacheDetection {
	risk_level: "none" | "low" | "medium" | "high";
	reasons: string[];
	prefix_hash: string;
	prefix_bytes: number;
	tool_fingerprint?: {
		names: string[];
		hash: string;
	};
	passthrough: {
		prompt_cache_key: boolean;
		prompt_cache_retention: boolean;
		cache_control: boolean;
	};
}
```

Detection rules:

- high risk when the same cache identity key has a different `static_prefix_hash` from the previous observation
- medium or high risk when tool names, count, or order changes for the same cache identity key
- medium risk when `instructions`, system, or developer content appears to contain dynamic request IDs, response IDs, UUIDs, nanoid-like values, ISO timestamps, Unix timestamps, current-time phrases, or other obvious runtime values
- medium risk when `requested_prompt_cache_key` is present but provider-side `prompt_cache_key` is missing, or when `requested_prompt_cache_retention` is present but provider-side `prompt_cache_retention` is missing
- low or informational risk when Anthropic-style `cache_control` is present or absent, because GodeX records this but does not add or remove it
- risk evidence is recorded only to trace DB and never fed back into request mapping

The detector receives the previous observation from `PromptCacheObservationIndex`, keyed by `provider + model + cache_identity_key`. The index is updated by `DefaultAdapter` after detection and does not read SQLite in the request path. If the previous observation is unavailable, detection still records the current prefix hash and uses risk rules that do not require history.

When both requested and provider-side cache keys are absent, the detector still computes and records `prefix_hash`, `prefix_bytes`, `tool_fingerprint`, passthrough status, and dynamic-text findings. Historical comparisons are skipped because there is no stable cache identity, so these rules do not run: same-key prefix hash changed, same-key tool order changed, and observation index updates. The absence of a cache key is not a risk by itself.

Dynamic-text detection is intentionally heuristic. False positives are expected and acceptable because detection results are observability data only. The first implementation keeps the patterns hard-coded and covered by tests; making patterns configurable is out of scope for this first trace DB feature.

`passthrough.cache_control` is future-proofing for providers with Anthropic-style request shapes. With the current OpenAI-compatible providers, it will usually be `false` and should not be treated as a failure by itself.

## Payload Capture

`capture_payload=false` is the default. In this mode, payload-level records include:

- `payload_hash`
- `payload_bytes`
- `payload_truncated=false`
- no payload JSON

`capture_payload=true` enables full request, mapped provider request, response, raw stream event, and transformed stream event capture. If serialized payload size exceeds `payload_max_bytes`, the trace record stores the hash, full byte count, a truncated payload preview, and `payload_truncated=true`.

The truncated preview is stored in the same `payload_json` column. `payload_bytes` always records the full serialized byte length before truncation, so operators can distinguish complete payloads from previews.

This replaces the old payload-level trace logger role while keeping payload capture explicit and opt-in.

## SQLite Schema

All `created_at` columns below store Unix milliseconds from the moment the trace row was observed or enqueued.

### `trace_requests`

Stores request-level cache analysis and detection:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `request_id TEXT NOT NULL`
- `response_id TEXT NOT NULL`
- `provider TEXT NOT NULL`
- `model TEXT NOT NULL`
- `stream INTEGER NOT NULL`
- `created_at INTEGER NOT NULL`
- `requested_prompt_cache_key TEXT NULL`
- `requested_prompt_cache_retention TEXT NULL`
- `prompt_cache_key TEXT NULL`
- `prompt_cache_retention TEXT NULL`
- `prefix_hash TEXT NULL`
- `prefix_bytes INTEGER NULL`
- `cache_risk_level TEXT NULL`
- `cache_risk_reasons_json TEXT NULL`
- `tool_fingerprint_json TEXT NULL`
- `passthrough_json TEXT NULL`
- `payload_hash TEXT NULL`
- `payload_bytes INTEGER NULL`
- `payload_json TEXT NULL`
- `payload_truncated INTEGER NOT NULL DEFAULT 0`

Indexes:

- `idx_trace_requests_request_id`
- `idx_trace_requests_requested_cache_identity` on `(provider, model, requested_prompt_cache_key, created_at)`
- `idx_trace_requests_provider_cache_identity` on `(provider, model, prompt_cache_key, created_at)`

`requested_prompt_cache_key` and `requested_prompt_cache_retention` come from the original Responses request through `PromptCacheAnalysisInput`. `prompt_cache_key` and `prompt_cache_retention` come from the mapped provider request. `prefix_hash` and `prefix_bytes` are written from `TraceRequestRecordEvent.cache_detection`. If detection is unavailable because analysis failed, those columns remain null.

### `trace_usage`

Stores usage and cache accounting:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `request_id TEXT NOT NULL`
- `response_id TEXT NOT NULL`
- `provider TEXT NOT NULL`
- `model TEXT NOT NULL`
- `created_at INTEGER NOT NULL`
- `input_tokens INTEGER NULL`
- `output_tokens INTEGER NULL`
- `total_tokens INTEGER NULL`
- `cached_tokens INTEGER NULL`
- `cache_hit_ratio REAL NULL`
- `cache_creation_input_tokens INTEGER NULL`
- `cache_read_input_tokens INTEGER NULL`
- `raw_usage_json TEXT NULL`

`cached_tokens` comes from OpenAI-style `input_tokens_details.cached_tokens` when available. `cache_creation_input_tokens` and `cache_read_input_tokens` come from raw provider usage payloads when those Anthropic-style fields are present. `cache_hit_ratio` is `cached_tokens / input_tokens` when both values are present and `input_tokens > 0`; otherwise it is null.

Usage recording is built from the mapped `ResponseUsage` plus optional `raw_usage`. Current OpenAI-compatible providers populate `input_tokens`, `output_tokens`, `total_tokens`, and `cached_tokens` through mapped Responses usage. Future Anthropic-style providers can pass raw usage into `TraceUsageRecordEvent.raw_usage`; the recorder extracts `cache_creation_input_tokens` and `cache_read_input_tokens` from that raw payload when present. Until such a provider exists, those columns remain null.

Indexes:

- `idx_trace_usage_request_id`
- `idx_trace_usage_response_id`

### `trace_events`

Stores event-level traces:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `request_id TEXT NOT NULL`
- `response_id TEXT NOT NULL`
- `event_name TEXT NOT NULL`
- `sequence INTEGER NOT NULL`
- `created_at INTEGER NOT NULL`
- `payload_hash TEXT NULL`
- `payload_bytes INTEGER NULL`
- `payload_json TEXT NULL`
- `payload_truncated INTEGER NOT NULL DEFAULT 0`

Indexes:

- `idx_trace_events_request_id_sequence`
- `idx_trace_events_event_name`

## Adapter Integration

### Non-Streaming

`DefaultAdapter.request(ctx)` flow:

1. Run `mapper.request.map(ctx)` to produce the provider request.
2. Analyze the provider request through `ProviderPromptCacheRequestAnalyzer`.
3. Read the previous prompt cache observation from `ctx.app.promptCacheObservationIndex`.
4. Detect cache risk through `PromptCacheDetector`.
5. Update `ctx.app.promptCacheObservationIndex` with the current observation when a cache identity key exists.
6. Record request-level cache analysis, detection, and the Responses request payload summary to `trace_requests`.
7. Record `provider.request.body` as a trace event summary and optional payload.
8. Call `client.request(providerRequest)`.
9. Record `provider.response.body` as a trace event summary and optional payload.
10. Map the response as before.
11. Record response usage to `trace_usage`.
12. Preserve existing diagnostics, session persistence, and completion logging behavior.

All trace operations use `record()` and are not awaited.

### Streaming

`DefaultAdapter.stream(ctx)` flow:

1. Run `mapper.request.map(ctx)` to produce the provider request.
2. Analyze the provider request through `ProviderPromptCacheRequestAnalyzer`.
3. Read the previous prompt cache observation from `ctx.app.promptCacheObservationIndex`.
4. Detect cache risk through `PromptCacheDetector`.
5. Update `ctx.app.promptCacheObservationIndex` with the current observation when a cache identity key exists.
6. Record request-level cache analysis, detection, and the Responses request payload summary to `trace_requests`.
7. Record `provider.request.body` as a trace event summary and optional payload.
8. Call `client.stream(providerRequest)`.
9. `TraceTransformer("upstream.stream.event.raw")` records raw provider SSE chunks.
10. `ProviderEventToResponseTransformer` maps provider chunks.
11. `TraceTransformer("upstream.stream.event.transformed")` records transformed Responses events.
12. `ResponseLogTransformer` records response usage to `trace_usage` when it observes a terminal response or terminal stream state with usage.
13. SSE output is never delayed by trace flushing.

`TraceTransformer` must enqueue each chunk unchanged. Trace recording is a side effect after pass-through and must not change stream output if recording fails.

No separate usage transformer is needed for the first implementation. `ResponseLogTransformer` already observes terminal response objects through `responseFromTerminalEvent()` and through `StreamResponseState` in `onFlush()`. It should call a shared trace usage helper at most once per stream, after enqueueing the chunk that exposed the terminal response. If the terminal response has no usage, no `trace_usage` row is written.

## Replacing Existing Trace Logs

Payload-level trace logging moves from `ctx.logger.trace(...)` to `app.traceRecorder.record(...)`.

The following logger trace payloads are replaced:

- `responses.request.body` into `trace_requests` payload columns
- `upstream.request.body` into `trace_events` as `provider.request.body`
- `upstream.response.body` into `trace_events` as `provider.response.body`
- `upstream.stream.event.raw`
- `upstream.stream.event.transformed`

Operational logs such as request completion, diagnostics, session save warnings, provider send/receive debug logs, and trace recorder warnings remain logger-based.

When `trace.enabled=false`, payload-level trace records are dropped by `NoopTraceRecorder`; GodeX no longer emits the old payload-level trace logger entries.

## Preserving Provider Cache Strategy

The feature observes provider cache behavior but never changes it.

Implementation must preserve these invariants:

- OpenAI provider continues to pass through `prompt_cache_key`, `prompt_cache_retention`, and `safety_identifier`.
- GodeX never generates `prompt_cache_key`.
- GodeX never adds or removes Anthropic `cache_control`.
- GodeX never mutates `metadata`, `prompt_cache_key`, `prompt_cache_retention`, messages, tools, system/developer content, or provider requests for trace purposes.
- GodeX never injects trace IDs, request IDs, timestamps, or random IDs into prompts or provider requests.
- GodeX never reorders static prefixes, messages, tools, or system/developer content.
- Cache detection findings are recorded only to `trace.db`.

Adapter tests must deep-compare the mapped provider request before and after trace recording to verify this invariant.

## Error Handling

Trace errors are observability failures, not API failures.

- Queue full: drop the record and `warn`.
- Payload serialization failure: drop payload for that record, keep a warning, and continue.
- SQLite migration failure during startup: if trace is enabled, fail startup because the configured trace store cannot be created.
- SQLite flush failure after startup: `warn`, drop that batch, and continue.
- Timer flush errors: caught inside recorder.
- `close()` errors during shutdown: `warn` and continue shutdown.

## Shutdown Lifecycle

`ApplicationContext` should expose `close(): Promise<void>`, closing resources in this order:

1. `traceRecorder.close()`
2. `sessionStore.close()`

`AsyncTraceRecorder.close()` stops its timer, attempts one final awaited-by-shutdown flush, closes the `SQLiteTraceStore`, catches failures, and logs warnings. This shutdown flush is outside the `/v1/responses` request path, so it may wait briefly for pending trace writes.

The CLI shutdown path should call `app.close()` instead of closing only the session store. Tests for `registerShutdownHandlers` should verify that both trace recorder and session store close paths are invoked.

`registerShutdownHandlers` should take a close callback instead of a `ResponseSessionStore`:

```ts
export function registerShutdownHandlers(
	server: { stop(): void } | { port: number },
	closeResources: () => void | Promise<void>,
	logger: Logger,
): void;
```

`serve()` passes `() => app.close()`. This keeps the shutdown helper independent of the concrete `ApplicationContext` type while allowing tests to assert that the application-level close path runs.

The shutdown handler should await `closeResources()` before calling `process.exit(0)`. If closing fails, it logs a warning and still exits.

## Testing

Add focused tests:

- Trace recorder unit tests:
  - `record()` returns synchronously and does not throw
  - queue full drops records and warns
  - flush writes batches
  - SQLite write failure warns and does not throw to callers
- SQLite migration tests:
  - creates `trace_requests`, `trace_usage`, and `trace_events`
  - creates key indexes
  - writes and reads usage with `cached_tokens`, `cache_creation_input_tokens`, and `cache_read_input_tokens`
- `ChatCompletionPromptCacheRequestAnalyzer` tests:
  - preserves message order
  - preserves tool order
  - extracts requested cache fields from the Responses request and provider-side cache fields from the mapped provider request
  - reports `cache_control` presence without modifying it
- `PrefixPromptCacheDetector` tests:
  - same cache identity key with changed prefix hash is high risk
  - changed tools order is detected
  - requests without requested or provider-side cache keys skip historical comparison but still record prefix hash and dynamic-text findings
  - dynamic values in instructions/system/developer content are detected
  - missing passthrough fields are detected
- Adapter tests:
  - trace recording does not mutate provider request (`deepEqual`)
  - non-stream response usage records `cached_tokens`
  - trace failures do not reject the request
- Stream tests:
  - `TraceTransformer` passes chunks through unchanged
  - raw and transformed stream event records contain hash/size
  - `ResponseLogTransformer` records terminal response usage exactly once when usage is present
- No route tests for `/v1/godex/*`, because this design adds no HTTP API.

Verification commands:

```bash
bun run typecheck
bun run lint
bun test
```

## Success Criteria

- Trace DB is disabled by default.
- Enabling trace creates a separate SQLite trace database with the required tables.
- Payload-level trace logging no longer writes request/response/stream bodies to `logger.trace`.
- Configurable payload capture can store full request and response payloads in trace DB.
- Trace recording never blocks `/v1/responses` or SSE output.
- Prompt cache detection records prefix hash, risk level, reasons, passthrough status, and usage cache metrics.
- Provider request semantics are unchanged, verified by deep equality tests.
- `bun run typecheck`, `bun run lint`, and `bun test` pass before implementation is considered complete.
