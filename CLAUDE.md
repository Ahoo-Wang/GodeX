# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GodeX is an OpenAI Responses API gateway that translates `/v1/responses` requests into upstream Chat Completions API calls. It exposes an OpenAI-compatible HTTP API while proxying to provider-specific backends (OpenAI, Zhipu/智谱). Built with **Bun** and **TypeScript**, using the `@ahoo-wang/fetcher` ecosystem for HTTP clients and SSE streaming.

## Commands

```bash
bun run dev          # Start dev server with hot reload on port 13145
bun run start        # Start server without hot reload
bun run build        # Build standalone binary (dist/index.js with bun shebang)

bun run lint         # Biome check src
bun run lint:fix     # Biome auto-fix src
bun run format       # Biome format src
bun run typecheck    # tsc --noEmit

bun run test         # Unit + integration tests (excludes src/e2e)
bun run test:e2e     # E2E tests (mock upstream, src/e2e)
bun run test:zhipu   # Live Zhipu integration tests (requires ZHIPU_LIVE_TESTS=1)
bun test <pattern>   # Run specific test(s) via Bun's test runner

bun run check        # typecheck + lint + test
bun run ci           # Full CI: typecheck + biome ci + test + test:e2e
```

## Architecture

### Request flow

```
CLI (serve) → ApplicationContext → Bun HTTP server (Router)
  → POST /v1/responses → ResponsesContext.create()
    → ModelResolver resolves model → provider+model
    → Session chain resolved via previous_response_id
    → Registrar resolves Provider adapter
    → DefaultAdapter.request() or .stream()
      → CompatibilityNegotiator produces CompatibilityPlan
      → ChatRequestMapper composes request from sub-mappers
      → ProviderClient calls upstream API
      → ChatResponseMapper / ChatStreamMapper composes response from sub-mappers
      → Session saved (unless store=false)
```

### Key abstractions

- **`Provider`** (`src/adapter/provider.ts`): Bundles a `ProviderMapper` (request/response/stream mapping) and a `ProviderClient` (HTTP calls).
- **`ProviderMapper`** (`src/adapter/mapper/contract.ts`): Three stable public contracts — `RequestMapper`, `ResponseMapper`, `StreamMapper`. Internally composed from sub-responsibility interfaces in `src/adapter/mapper/chat/contract.ts`.
- **`ProviderClient`** (`src/adapter/provider.ts`): Generic interface for `request()` and `stream()` — the HTTP boundary to upstream providers. Implemented by `ChatProviderClient` (`src/providers/shared/chat-provider-client.ts`).
- **`Adapter`** (`src/adapter/adapter.ts`): Orchestrates mapper + client calls, session persistence, and stream pipeline assembly.
- **`ModelResolver`** (`src/resolver/index.ts`): Parses `model` selectors (`"provider/model"` or bare `"model"` using default_provider) and applies per-provider model name mappings.
- **`Registrar`** (`src/providers/registrar.ts`): Registry of `ProviderFactory` functions. Built once, resolves provider instances for each request.
- **`ResponsesContext`** (`src/context/responses-context.ts`): Per-request context carrying the parsed body, resolved model, selected provider, session snapshot, and a scoped logger.

### Mapper composition

The `ProviderMapper` is assembled from focused sub-responsibility interfaces defined in `src/adapter/mapper/chat/contract.ts`:

**Request:** `CompatibilityNegotiator` → `ChatRequestFactory` → `ChatMessageMapper` → `ChatToolMapper` → `ChatToolChoiceMapper` → `ChatRequestOptionsMapper`

**Response:** `ChatResponseAccessor` → `ChatResponseOutputMapper` + `ChatUsageMapper` + `ChatFinishReasonMapper` → `ResponseObject`

**Stream:** `ChatStreamDeltaMapper` + `ChatFinishReasonMapper` + `ChatToolCallMapper` + `ChatToolCallIdentityResolver` → `StreamResponseState` → SSE events

These are composed by `ChatRequestMapper`, `ChatResponseMapper`, and `ChatStreamMapper` in `src/adapter/mapper/chat/`.

### Compatibility negotiation

Each provider declares `ProviderCapabilities` (supported parameters, tools, tool choices, response formats, reasoning, streaming). The `CompatibilityNegotiator` produces a `CompatibilityPlan` per request — rejecting unsupported features, degrading with diagnostics, or passing through with effective values. The plan drives all downstream mapper decisions. Diagnostics flow through `ResponsesContext` to the existing compatibility logging path.

### Provider structure

Each provider under `src/providers/<name>/` implements the sub-responsibility interfaces from `chat/contract.ts` in individual mapper files (`messages.ts`, `tools.ts`, `request-options.ts`, `response-output.ts`, `usage.ts`, `finish-reason.ts`, `stream-delta.ts`, `tool-calls.ts`, `capabilities.ts`, `compatibility.ts`), wired together by a `createXxxMapper()` factory in `mapper/index.ts`. The provider class (`provider.ts`) bundles the mapper with a `ChatProviderClient` subclass.

### Layer boundaries

`src/adapter/mapper/chat/` must never import from `src/providers/`. Provider-specific code implements the chat contracts; the chat infrastructure stays provider-agnostic. Shared provider utilities live in `src/providers/shared/` — extract common logic there before duplicating across providers.

### Stream pipeline

Streams use `TransformStream` via `pipeTransform()` (`src/adapter/transformers/stream-utils.ts`):

1. **`ProviderEventToResponseTransformer`** — per-event translation via StreamMapper.map()
2. **`ResponseSessionPersistenceTransformer`** — intercepts terminal events, builds final ResponseObject from accumulated `StreamState`, saves session
3. **`ResponseSseEncodeTransformer`** — serializes ResponseStreamEvent to SSE byte stream

### Session storage

`src/session/` implements `ResponseSessionStore` with two backends:
- `MemoryResponseSessionStore` — in-memory Map
- `SQLiteResponseSessionStore` — Bun's built-in SQLite

Sessions track `previous_response_id` chains for multi-turn conversations. Chain resolution handles cycle detection, depth limits, and status filtering.

### Error hierarchy

`src/error/` — all errors extend `GodeXError` with domain/code/status/context:
- `ServerError` (4xx) — request validation, missing model, unknown provider
- `AdapterError` — unsupported parameters, tools, or input items
- `ProviderError` — upstream HTTP errors (rate limits, timeouts, 5xx)
- `SessionError` — chain not found, cycles, depth exceeded, conflicts

### Configuration

`godex.yaml` → `GodeXConfig` type (`src/config/schema.ts`). Environment variable interpolation via `${ENV_VAR}` syntax. Dev mode (when `godex.yaml` exists in cwd or `NODE_ENV=development`) changes default paths to local instead of `~/.godex/`.

### Testing

Tests use Bun's built-in test runner. E2E tests in `src/e2e/` mock upstream via Fetcher's decorator-based HTTP client pattern. Provider conformance tests in `src/providers/provider-conformance.test.ts` validate mapper structural contracts. Live Zhipu tests require `ZHIPU_API_KEY` and are gated behind `ZHIPU_LIVE_TESTS=1`. CI only runs live Zhipu tests on push to main (not PRs).
