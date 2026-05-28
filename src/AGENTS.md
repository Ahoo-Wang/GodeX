# AGENTS.md — Source Code

AI coding agent instructions for the GodeX source tree.

## Build & Test

```bash
bun install && bun run check          # Install + full check
bun test src/adapter/                 # Test specific module
bun test src/providers/provider-conformance.test.ts  # Provider structural contracts
bun run test:e2e                      # E2E with mocked upstream
```

## Architecture

### Request flow

```
CLI → ApplicationContext → Bun HTTP server
  → POST /v1/responses → ResponsesContext
    → ModelResolver → Session chain → Registrar → DefaultAdapter
      → ProviderExchange builds Chat Completions request through bridge/request
      → ProviderEdge calls upstream through ChatProviderClient
      → bridge/response or bridge/stream reconstructs Responses output
      → Session saved
```

### Bridge kernel

`src/bridge/` is the only place for provider-agnostic Responses→Chat policy:

- `compatibility/` — capability negotiation and diagnostics
- `request/` — Responses input/session normalization and Chat Completions request assembly
- `tools/` — tool/tool_choice support, downgrade, identity planning, and restoration
- `output/` — output-format contract and strict downgraded JSON validation
- `response/` — Chat Completions response reconstruction
- `stream/` — provider delta validation and Responses SSE state machine

`src/adapter/` owns orchestration only: sync/stream pipelines, session persistence, logging, trace transforms, and compatibility logging. It must not reintroduce mapper wrapper contracts.

### Provider pattern

Each provider now contributes a compact `ProviderSpec` and an edge client:

- `spec.ts` — capabilities, endpoint, auth, tool-name codec, response/stream accessors, optional hooks
- `client.ts` — creates `ProviderEdge` with `ChatProviderClient`
- `hooks.ts` — provider-specific accessors, usage mapping, stream delta extraction, request patching
- `protocol/` — provider-specific Chat Completions types when needed

Shared provider utilities (`providers/shared/`):
- `chat-provider-client.ts` — `ChatProviderClient` (HTTP boundary, wraps Fetcher)
- `response-message-payloads.ts` — `convertResponseItemToMessage` and payload extraction
- `chat-api.ts` — Fetcher-based `ChatApi` factory
- `stream-result-extractor.ts` — SSE JSON parsing

Provider-agnostic bridge decisions live in `bridge/`:
- `compatibility/` — ignored parameter diagnostics and response-format planning
- `tools/` — tool/tool_choice support, downgrade, and rejection planning
- `output/` — output-format contracts and strict downgraded JSON validation

### Key rules

- `adapter/mapper/` and `adapter/provider.ts` are legacy architecture and must stay removed
- Shared protocol plumbing between providers goes in `providers/shared/`
- Shared bridge decisions between providers go in `bridge/`, never duplicated
- All errors use `GodeXError` hierarchy (`src/error/`) with domain codes from `error/codes.ts`
- Providers declare capabilities; bridge planners decide compatibility once per request and emit diagnostics

## Conventions

- TypeScript strict mode, ESNext, ESM (`verbatimModuleSyntax`)
- Biome for linting/formatting (tab indentation)
- Bun test runner — tests colocated with source as `*.test.ts`
- camelCase for functions/variables, PascalCase for classes/interfaces/types
- No comments unless explaining WHY (not WHAT)

## Boundaries

✅ Always:
- Run `bun run check` before committing
- Use domain error codes from `error/codes.ts`
- Extract shared bridge decisions to `bridge/` before duplicating across providers
- Extract shared provider protocol plumbing to `providers/shared/`

⚠️ Ask first:
- Adding new provider implementations
- Changing the `ProviderSpec` / `ProviderEdge` contract
- Modifying the stream pipeline transformers
- Changing the config schema

🚫 Never:
- Recreate `adapter/mapper/`, `adapter/provider.ts`, or provider-specific mapper forests
- Duplicate bridge decisions between providers without extracting to `bridge/`
- Throw raw `Error` in adapter/provider code — use the GodeXError hierarchy
- Use Node.js APIs when Bun equivalents exist
- Use external test frameworks (Bun's built-in runner only)
