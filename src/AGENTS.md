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
      → CompatibilityNegotiator produces CompatibilityPlan
      → ChatRequestMapper assembles upstream request from sub-mappers
      → ProviderClient calls upstream
      → ChatResponseMapper / ChatStreamMapper assembles response
      → Session saved
```

### Mapper composition

The `ProviderMapper` is built from sub-responsibility interfaces in `adapter/mapper/chat/contract.ts`:

**Request:** `CompatibilityNegotiator` → `OutputFormatContract` → `ChatRequestFactory` → `ChatMessageMapper` → `ChatToolIndexBuilder` → `ChatToolChoiceMapper` → `ChatRequestOptionsMapper`

**Response:** `ChatResponseAccessor` → `ChatResponseOutputMapper` + `ChatUsageMapper` + `ChatFinishReasonMapper` → `buildChatResponseObject`

**Stream:** `ChatStreamDeltaMapper` + `ChatFinishReasonMapper` + `ChatToolCallRestorer` → `StreamResponseState`

The composition classes (`ChatRequestMapper`, `ChatResponseMapper`, `ChatStreamMapper`) live in `adapter/mapper/chat/`.

### Provider pattern

Each provider in `providers/<name>/mapper/` implements the sub-responsibility interfaces in individual files — `messages.ts`, `tools.ts`, `request-options.ts`, `response-output.ts`, `usage.ts`, `finish-reason.ts`, `stream-delta.ts`, `tool-calls.ts`, `capabilities.ts`, `compatibility.ts` — wired together by a `createXxxMapper()` factory.

Shared provider utilities (`providers/shared/`):
- `chat-provider-client.ts` — `ChatProviderClient` (HTTP boundary, wraps Fetcher)
- `response-message-payloads.ts` — `convertResponseItemToMessage` and payload extraction
- `chat-api.ts` — Fetcher-based `ChatApi` factory
- `stream-result-extractor.ts` — SSE JSON parsing

### Key rules

- `adapter/mapper/chat/` must never import from `providers/` — it defines contracts, providers implement them
- Shared logic between providers goes in `providers/shared/`, never duplicated
- All errors use `GodeXError` hierarchy (`src/error/`) with domain codes from `error/codes.ts`
- `CompatibilityNegotiator.negotiate()` is called once per request; `CompatibilityPlan` drives all downstream mapper decisions

## Conventions

- TypeScript strict mode, ESNext, ESM (`verbatimModuleSyntax`)
- Biome for linting/formatting (tab indentation)
- Bun test runner — tests colocated with source as `*.test.ts`
- camelCase for functions/variables, PascalCase for classes/interfaces/types
- No comments unless explaining WHY (not WHAT)

## Boundaries

✅ Always:
- Implement sub-responsibility interfaces when adding provider logic
- Run `bun run check` before committing
- Use domain error codes from `error/codes.ts`
- Extract shared logic to `providers/shared/` before duplicating across providers

⚠️ Ask first:
- Modifying interfaces in `adapter/mapper/chat/contract.ts` (affects all providers)
- Changing the `Adapter`, `Provider`, or stable mapper contract interfaces
- Modifying the stream pipeline transformers
- Changing the config schema

🚫 Never:
- Import from `providers/*/` inside `adapter/mapper/chat/` (layer boundary)
- Duplicate mapper logic between providers without extracting to `providers/shared/`
- Throw raw `Error` in adapter/provider code — use the GodeXError hierarchy
- Use Node.js APIs when Bun equivalents exist
- Use external test frameworks (Bun's built-in runner only)
