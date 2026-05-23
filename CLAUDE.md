# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

GodeX is an OpenAI Responses API gateway that translates `/v1/responses` requests into upstream Chat Completions API calls. It exposes an OpenAI-compatible HTTP API while proxying to provider-specific backends (starting with Zhipu/智谱). Built with **Bun** and **TypeScript**, using the `@ahoo-wang/fetcher` ecosystem for HTTP clients and SSE streaming.

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
      → ProviderMapper.request maps to upstream request
      → ChatClient calls upstream API
      → ProviderMapper.response/stream maps back to Responses API shape
      → Session saved (unless store=false)
```

### Key abstractions

- **`Provider`** (`src/adapter/provider.ts`): A named adapter that bundles a `ProviderMapper` (request/response/stream mapping), a `ChatClient` (HTTP calls), and a `ProviderCapabilities` declaration.
- **`ProviderMapper`** (`src/adapter/mapper/contract.ts`): Three mapping functions — `RequestMapper` (ResponsesContext → upstream request), `ResponseMapper` (upstream response → ResponseObject), `StreamMapper` (upstream SSE chunks → ResponseStreamEvent[]).
- **`ChatClient`** (`src/adapter/chatClient.ts`): Generic interface for `chat()` and `streamChat()` — the HTTP boundary to upstream providers.
- **`Adapter`** (`src/adapter/adapter.ts`): Orchestrates mapper + chatClient calls, session persistence, and stream pipeline assembly.
- **`ModelResolver`** (`src/resolver/index.ts`): Parses `model` selectors (`"provider/model"` or bare `"model"` using default_provider) and applies per-provider model name mappings.
- **`Registrar`** (`src/providers/registrar.ts`): Registry of `ProviderFactory` functions. Built once, resolves provider instances for each request.
- **`ResponsesContext`** (`src/context/responses-context.ts`): Per-request context carrying the parsed body, resolved model, selected provider, session snapshot, and a scoped logger.

### Provider implementation (Zhipu)

`src/providers/zhipu/` is the reference provider implementation. It follows this pattern:

- `provider.ts` — assembles mapper + client + capabilities
- `request.ts` — builds Zhipu ChatCompletionTextRequest from ResponsesContext
- `response.ts` — maps ChatCompletionResponse → ResponseObject
- `stream.ts` — `ZhipuStreamMapper` implements StreamMapper, tracks `StreamState`
- `chat-client.ts` — `ZhipuChatClient` wraps Fetcher for upstream HTTP calls
- `messages.ts` — input item → chat message conversion
- `tools.ts` — OpenAI tool definitions → Zhipu tool format
- `protocol/` — Zhipu-specific request/response type definitions

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

Tests use Bun's built-in test runner. E2E tests in `src/e2e/` mock upstream via Fetcher's decorator-based HTTP client pattern. Live Zhipu tests require `ZHIPU_API_KEY` and are gated behind `ZHIPU_LIVE_TESTS=1`. CI only runs live Zhipu tests on push to main (not PRs).
