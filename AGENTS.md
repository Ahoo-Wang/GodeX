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
│   └── output/         Output-format contract and strict JSON validation
├── adapter/          Adapter interface, DefaultAdapter, stream transformers
│   ├── mapper/       Stable public mapper contracts (RequestMapper, ResponseMapper, StreamMapper)
│   │   └── chat/     Shared chat mapper infrastructure
│   │       ├── contract.ts       Sub-responsibility interfaces (ChatRequestFactory, ChatMessageMapper, etc.)
│   │       ├── compatibility-plan.ts  ProviderCapabilities, CompatibilityDecision, CompatibilityPlan
│   │       ├── request-mapper.ts      ChatRequestMapper composition class
│   │       ├── response-mapper.ts     ChatResponseMapper composition class
│   │       ├── response-object-builder.ts  Shared ResponseObject envelope builder
│   │       ├── stream-mapper.ts       ChatStreamMapper composition class
│   │       ├── stream-response-state.ts   Stream SSE lifecycle state machine
│   │       └── stream-response-*.ts   Stream output/tool-call/message helpers
│   └── transformers/ ProviderEvent→Response→SSE encode pipeline
├── providers/        Provider registry + factories
│   ├── registrar.ts  Registrar (factory registration + provider resolution)
│   ├── builtin.ts    createBuiltinRegistrar() wiring
│   ├── shared/       Shared provider protocol utilities
│   │   ├── chat-provider-client.ts    ChatProviderClient (HTTP boundary)
│   │   ├── chat-api.ts               Fetcher-based ChatApi factory
│   │   ├── response-message-payloads.ts  Input item → message conversion, shared responseItemToMessage
│   │   └── stream-result-extractor.ts    SSE JSON parsing
│   ├── deepseek/     DeepSeek Chat Completions bridge provider
│   └── zhipu/        Zhipu provider
│       ├── protocol/    Zhipu-specific Chat Completions types
│       └── mapper/      Zhipu-specific mapper modules (capabilities, compatibility, messages, tools, etc.)
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

Request flow: CLI → ApplicationContext → Bun HTTP server → POST /v1/responses → ResponsesContext.create() → ModelResolver → Session chain → Registrar → DefaultAdapter → ProviderMapper → ChatClient → Upstream

### Key Abstractions

- **`Provider`** (`src/adapter/provider.ts`): Bundles a `ProviderMapper` (request/response/stream mapping), a `ProviderClient` (HTTP calls).
- **`ProviderMapper`** (`src/adapter/mapper/contract.ts`): Three stable public contracts — `RequestMapper`, `ResponseMapper`, `StreamMapper`. Internally composed from sub-responsibility interfaces.
- **`ChatClient`** / **`ProviderClient`** (`src/adapter/provider.ts`): Generic interface for `request()` and `stream()` — the HTTP boundary to upstream providers.
- **`Adapter`** (`src/adapter/adapter.ts`): Orchestrates mapper + client calls, session persistence, and stream pipeline assembly.
- **`ModelResolver`** (`src/resolver/index.ts`): Parses `model` selectors (`"provider/model"` or bare `"model"` using default_provider) and applies per-provider model name mappings.
- **`Registrar`** (`src/providers/registrar.ts`): Registry of `ProviderFactory` functions. Built once, resolves provider instances for each request.
- **`ResponsesContext`** (`src/context/responses-context.ts`): Per-request context carrying the parsed body, resolved model, selected provider, session snapshot, and a scoped logger.
- **`bridge/*`** (`src/bridge/`): Provider-agnostic planning kernel for compatibility diagnostics, tool/tool_choice downgrade decisions, and output-format validation.

### Mapper Composition Architecture

The `ProviderMapper` is assembled from focused sub-responsibility interfaces defined in `src/adapter/mapper/chat/contract.ts`:

**Request side:**
- `CompatibilityNegotiator` — centralized compatibility decision per request, normally backed by `planBridgeCompatibility()`, produces a `CompatibilityPlan`
- `ChatRequestFactory` — creates the minimum valid upstream request skeleton (model + empty containers)
- `ChatMessageMapper` — converts Responses input items + instructions into upstream messages
- `ChatToolMapper` / `ChatToolChoiceMapper` — renders tool declarations and tool_choice after `planBridgeTools()` has decided support, downgrade, or rejection
- `ChatRequestOptionsMapper` — applies optional parameters (temperature, top_p, reasoning, response_format, etc.)

**Response side:**
- `ChatResponseAccessor` — extracts the first choice and finish reason from an upstream response
- `ChatResponseOutputMapper` — builds output items from the upstream response
- `ChatUsageMapper` — maps upstream usage to Responses `ResponseUsage`
- `ChatFinishReasonMapper` — maps upstream finish reasons to Responses status/error/incomplete_details
- `ChatToolCallMapper` / `ChatToolCallIdentityResolver` — maps tool calls back to Responses items with namespace restoration

**Stream side:**
- `ChatStreamDeltaMapper` — extracts choice, text, reasoning, refusal, tool calls, and usage from SSE chunks
- `StreamResponseState` — provider-agnostic SSE lifecycle state machine (IDLE → IN_PROGRESS → COMPLETED/INCOMPLETE/FAILED)

These are composed by `ChatRequestMapper`, `ChatResponseMapper`, and `ChatStreamMapper` in `src/adapter/mapper/chat/`.

### Compatibility Negotiation

Each provider declares a `ProviderCapabilities` (supported parameters, tools, tool choices, response formats, reasoning mode, streaming features). The bridge layer turns those capabilities into a `CompatibilityPlan`, `BridgeToolPlan`, output-format contract, and diagnostics. Provider mappers should render already-planned decisions rather than re-deciding support locally.

### Provider Implementation Pattern

Each provider follows this structure under `src/providers/<name>/`:

```
provider/
├── provider.ts         # Provider class (assembles mapper + client)
├── provider-client.ts  # ChatProviderClient subclass (base URL, auth)
├── factory.ts          # createXxxProvider(config) factory
├── index.ts            # Barrel re-export
├── protocol/           # Provider-specific type definitions (Zhipu only)
└── mapper/
    ├── index.ts        # createXxxMapper() + barrel exports
    ├── capabilities.ts # ProviderCapabilities declaration
    ├── compatibility.ts# CompatibilityNegotiator implementation
    ├── messages.ts     # ChatMessageMapper implementation
    ├── tools.ts        # ChatToolMapper + ChatToolChoiceMapper implementations
    ├── request-options.ts  # ChatRequestFactory + ChatRequestOptionsMapper
    ├── response-output.ts  # ChatResponseAccessor + ChatResponseOutputMapper
    ├── usage.ts        # ChatUsageMapper
    ├── finish-reason.ts# ChatFinishReasonMapper
    ├── stream-delta.ts # ChatStreamDeltaMapper
    └── tool-calls.ts   # ChatToolCallMapper + ChatToolCallIdentityResolver
```

### Stream Pipeline

Streams use `TransformStream` via `pipeTransform()` (`src/adapter/transformers/stream-utils.ts`):

1. **`ProviderEventToResponseTransformer`** — per-event translation via StreamMapper.map()
2. **`ResponseOutputContractValidationTransformer`** — validates terminal output contracts and rewrites invalid strict downgraded JSON to `response.failed`
3. **`ResponseLogTransformer`** — records usage and completion diagnostics
4. **`ResponseSessionPersistenceTransformer`** — intercepts terminal events, builds final ResponseObject from accumulated StreamState, saves session
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

Provider conformance tests in `src/providers/provider-conformance.test.ts` validate that every provider mapper satisfies the structural contract (fresh instances, all mappers present and callable).

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
- Implement mapper sub-responsibility interfaces when adding provider-specific logic

⚠️ Ask first:
- Adding new provider implementations
- Modifying the Adapter, Provider, or stable mapper contract interfaces
- Changing the config schema
- Modifying stream pipeline transformers

🚫 Never:
- Bypass the GodeXError hierarchy with raw `Error` throws in adapter/provider code
- Use Node.js-specific APIs when Bun equivalents exist
- Add external test frameworks (use Bun's built-in test runner)
- Import from `providers/*/` inside `adapter/mapper/chat/` (strict layer boundary)
- Duplicate bridge decisions between providers without extracting to `src/bridge/`
