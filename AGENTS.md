# AGENTS.md — GodeX

AI coding agent instructions for the GodeX project.

## Build & Run Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Dev server with hot reload (port 13145)
bun run start                # Start server without hot reload
bun run build                # Build standalone binary for current platform
bun run compile:all          # Cross-compile all 6 platforms
```

## Testing

```bash
bun test <pattern>           # Run specific test(s)
bun run test                 # Unit + integration tests (excludes src/e2e)
bun run test:e2e             # E2E tests with mocked upstream
bun run test:zhipu           # Live Zhipu integration (needs ZHIPU_API_KEY + ZHIPU_LIVE_TESTS=1)
bun run test:coverage        # Tests with coverage
```

## Code Quality

```bash
bun run typecheck            # tsc --noEmit
bun run lint                 # Biome check
bun run lint:fix             # Biome auto-fix
bun run format               # Biome format
bun run check                # typecheck + lint + test
bun run ci                   # Full CI: typecheck + biome ci + test + e2e
```

## Project Structure

```
src/
├── cli/              Commander CLI (serve, config, init)
├── config/           godex.yaml schema, env interpolation, defaults
├── context/          ApplicationContext (DI), ResponsesContext (per-request)
├── bridge/           Provider-agnostic Responses→Chat bridge planning
│   ├── compatibility/  CompatibilityPlan diagnostics and response-format planning
│   ├── tools/          Tool/tool_choice support, downgrade, and rejection planning
│   ├── output/         Output-format contract and strict JSON validation
│   ├── request/        Responses/session input → Chat Completions request
│   ├── response/       Chat Completions response → ResponseObject
│   └── stream/         Provider delta → Responses SSE state machine
├── adapter/          Adapter interface, DefaultAdapter, stream transformers
│   ├── provider-exchange.ts  Builds provider requests and calls ProviderEdge
│   ├── sync-request-pipeline.ts  Sync orchestration, validation, session save
│   ├── stream-pipeline.ts  Stream orchestration and state machine wiring
│   └── transformers/ ProviderEvent→Response→SSE encode pipeline
├── providers/        Provider registry + factories
│   ├── registrar.ts  Registrar (factory registration + provider resolution)
│   ├── builtin.ts    createBuiltinRegistrar() wiring
│   ├── shared/       Shared provider protocol utilities
│   │   ├── chat-provider-client.ts    ChatProviderClient (HTTP boundary)
│   │   ├── chat-api.ts               Fetcher-based ChatApi factory
│   │   ├── response-message-payloads.ts  Input item → message conversion, shared responseItemToMessage
│   │   └── stream-result-extractor.ts    SSE JSON parsing
│   ├── deepseek/     ProviderSpec + client + hooks + protocol types
│   └── zhipu/        ProviderSpec + client + hooks + protocol types
├── resolver/         ModelResolver (model selector → provider + model)
├── server/           Bun HTTP server, routes (/v1/responses, /health, /v1/models)
├── session/          ResponseSessionStore (Memory + SQLite), chain resolution
├── error/            GodeXError hierarchy with domain codes
├── protocol/openai/  OpenAI Responses API type definitions
├── logger/           Structured JSON logger
└── e2e/              End-to-end tests with mocked upstream
```

## Code Style

- **Language**: TypeScript (strict mode), ESNext target
- **Runtime**: Bun (uses Bun.serve, bun:sqlite, bun test runner)
- **Formatter**: Biome with tab indentation
- **Linter**: Biome with recommended rules
- **Imports**: ESM (`"type": "module"`), `verbatimModuleSyntax`
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces/types
- **Error handling**: Use the GodeXError hierarchy (ServerError, AdapterError, ProviderError, SessionError) with domain codes from `src/error/codes.ts`. Never throw raw `Error` in adapter/provider code.
- **No comments** unless explaining WHY (not WHAT)

## Architecture

GodeX translates OpenAI Responses API requests into upstream Chat Completions API calls. If an upstream already supports the Responses API natively, it should not be configured as a GodeX provider.

Request flow: CLI → ApplicationContext → Bun HTTP server → POST /v1/responses → ResponsesContext.create() → ModelResolver → Session chain → Registrar → DefaultAdapter → ProviderExchange → ProviderEdge → Upstream

### Key Abstractions

- **`ProviderSpec`** (`src/bridge/provider-spec/contract.ts`): Declarative provider capability, endpoint, tool-name codec, response accessor, stream delta accessor, and optional hooks.
- **`ProviderEdge`** (`src/bridge/provider-spec/contract.ts`): Runtime edge with `request()` and `stream()` for one provider.
- **`ChatProviderClient`** (`src/providers/shared/chat-provider-client.ts`): Fetcher-based HTTP boundary to upstream Chat Completions APIs.
- **`Adapter`** (`src/adapter/adapter.ts`): Orchestrates sync/stream pipelines, session persistence, and stream transforms.
- **`ModelResolver`** (`src/resolver/index.ts`): Parses `model` selectors (`"provider/model"` or bare `"model"` using default_provider) and applies per-provider model name mappings.
- **`Registrar`** (`src/providers/registrar.ts`): Registry of `ProviderFactory` functions. Built once, resolves provider instances for each request.
- **`ResponsesContext`** (`src/context/responses-context.ts`): Per-request context carrying the parsed body, resolved model, selected provider, session snapshot, and a scoped logger.
- **`bridge/*`** (`src/bridge/`): Provider-agnostic planning kernel for compatibility diagnostics, tool/tool_choice downgrade decisions, and output-format validation.

### Bridge Kernel Architecture

The adapter no longer exposes mapper wrapper contracts. Shared behavior is centralized in focused bridge modules:

- `bridge/compatibility` plans supported, degraded, ignored, or rejected request capabilities.
- `bridge/tools` plans tool declarations, `tool_choice`, degradation, identity mapping, and call restoration.
- `bridge/output` owns output-format contracts, including strict downgraded JSON validation.
- `bridge/request` assembles Chat Completions requests from current input plus GodeX-owned session history.
- `bridge/response` reconstructs sync `ResponseObject` results from provider accessors.
- `bridge/stream` owns the Responses SSE lifecycle state machine.

### Compatibility Negotiation

Each provider declares a `ProviderCapabilities` (supported parameters, tools, tool choices, response formats, reasoning mode, streaming features). The bridge layer turns those capabilities into a `CompatibilityPlan`, `ToolPlan`, output-format contract, and diagnostics. Provider hooks/accessors expose raw protocol differences; they should not silently re-decide shared compatibility policy.

### Provider Implementation Pattern

Each provider follows this structure under `src/providers/<name>/`:

```
provider/
├── spec.ts             # ProviderSpec: capabilities, endpoint, accessors, hooks
├── client.ts           # createXxxProviderEdge(config) using ChatProviderClient
├── hooks.ts            # Provider-specific accessors, usage, stream deltas, patches
├── index.ts            # Barrel re-export
└── protocol/           # Provider-specific Chat Completions types when needed
```

### Stream Pipeline

Streams use `TransformStream` via `pipeTransform()` (`src/adapter/transformers/stream-utils.ts`):

1. **Provider event translation in `StreamPipeline`** — provider SSE data → bridge stream deltas → Responses SSE state machine
2. **`ResponseOutputContractValidationTransformer`** — validates terminal output contracts and rewrites invalid strict downgraded JSON to `response.failed`
3. **`ResponseLogTransformer`** — records usage and completion diagnostics
4. **`ResponseSessionPersistenceTransformer`** — intercepts terminal events and saves session
5. **`CompatibilityLogTransformer`** — emits compatibility diagnostics once per stream
6. **`ResponseSseEncodeTransformer`** — serializes ResponseStreamEvent to SSE byte stream

### Session Storage

`src/session/` implements `ResponseSessionStore` with two backends:
- `MemoryResponseSessionStore` — in-memory Map
- `SQLiteResponseSessionStore` — Bun's built-in SQLite

Sessions track `previous_response_id` chains for multi-turn conversations. Chain resolution handles cycle detection, depth limits, and status filtering.

### Error Hierarchy

`src/error/` — all errors extend `GodeXError` with domain/code/status/context:
- `ServerError` (4xx) — request validation, missing model, unknown provider
- `AdapterError` — unsupported parameters, tools, or input items
- `ProviderError` — upstream HTTP errors (rate limits, timeouts, 5xx)
- `SessionError` — chain not found, cycles, depth exceeded, conflicts

### Configuration

`godex.yaml` → `GodeXConfig` type (`src/config/schema.ts`). Environment variable interpolation via `${ENV_VAR}` syntax. Dev mode (when `godex.yaml` exists in cwd or `NODE_ENV=development`) changes default paths to local instead of `~/.godex/`.

### Testing

Tests use Bun's built-in test runner. E2E tests in `src/e2e/` mock upstream via Fetcher's decorator-based HTTP client pattern. Live Zhipu tests require `ZHIPU_API_KEY` and are gated behind `ZHIPU_LIVE_TESTS=1`. CI only runs live Zhipu tests on push to main (not PRs).

Provider conformance tests in `src/providers/provider-conformance.test.ts` validate that every built-in provider exposes a valid `ProviderSpec` and `ProviderEdge`.

## Git Workflow

- Main branch: `main`
- CI runs on push to main and PRs to main
- Live Zhipu tests only on push to main (not PRs)

## Boundaries

✅ Always:
- Run `bun run check` before committing
- Use Bun APIs (Bun.serve, bun:sqlite) over Node equivalents
- Follow the existing error hierarchy pattern — use domain error codes from `src/error/codes.ts`
- Write tests for new functionality
- Use the `@ahoo-wang/fetcher` ecosystem for HTTP clients
- Keep shared Responses→Chat policy in `src/bridge/`

⚠️ Ask first:
- Adding new provider implementations
- Modifying the Adapter, `ProviderSpec`, or `ProviderEdge` contracts
- Changing the config schema
- Modifying stream pipeline transformers

🚫 Never:
- Bypass the GodeXError hierarchy with raw `Error` throws in adapter/provider code
- Use Node.js-specific APIs when Bun equivalents exist
- Add external test frameworks (use Bun's built-in test runner)
- Recreate `src/adapter/mapper/` or `src/adapter/provider.ts`
- Duplicate bridge decisions between providers without extracting to `src/bridge/`
