# AGENTS.md - GodeX

Coding-agent instructions for the GodeX repository.

## Build And Run

```bash
bun install                  # Install dependencies
bun run dev                  # Dev server with hot reload on port 13145
bun run start                # Start server from source
bun run build                # Build a binary for the current platform
bun run compile:all          # Cross-compile all supported platform packages
godex init                   # Create a godex.yaml interactively
godex serve --config ./godex.yaml
godex config check --config ./godex.yaml
godex config print --config ./godex.yaml
```

The runtime config default port is `5678`; `bun run dev` explicitly uses port `13145`.

## Testing

```bash
bun run typecheck            # tsc --noEmit
bun run lint                 # biome check src
bun run lint:fix             # biome check --write src
bun run format               # biome format --write src
bun run test                 # Unit + integration tests; excludes src/e2e
bun test src/bridge/tools/tool-plan.test.ts
bun run test:e2e             # Mocked upstream E2E tests
bun run test:zhipu           # Live Zhipu tests; needs ZHIPU_API_KEY
bun run test:coverage        # Coverage for non-e2e tests
bun run check                # typecheck + lint + test
bun run ci                   # typecheck + biome ci + test + e2e
```

Run `bun run check` before committing code. Run `bun run test:e2e` when request routing, providers, sessions, traces, or stream behavior changes.

## Project Structure

```text
src/
  cli/          Commander CLI, commands, init wizard, runtime config
  config/       godex.yaml parsing, defaults, validation, env interpolation
  context/      ApplicationContext and request-scoped ResponsesContext
  bridge/       Provider-agnostic Responses-to-Chat kernel
  providers/    Provider registry, specs, clients, hooks, protocol DTOs
  responses/    Sync and streaming orchestration pipelines
  server/       Bun routes: /health, /v1/models, /v1/responses
  resolver/     Model selector and alias resolution
  session/      Memory and SQLite previous_response_id stores
  trace/        SQLite trace records for requests, usage, events, errors
  logger/       LogTape-based structured logging
  error/        GodeXError hierarchy and domain codes
  protocol/     OpenAI protocol type definitions
  tools/        Codex built-in tool definitions
  testing/      Shared test provider utilities
```

Generated or external directories such as `node_modules/`, `dist/`, and platform build output should not be edited by hand.

## Runtime Flow

```text
CLI
  -> ApplicationContext
  -> Bun server
  -> POST /v1/responses
  -> parse request
  -> create ResponsesContext
  -> ModelResolver
  -> ResponseSessionStore chain lookup
  -> Registrar resolves ProviderEdge
  -> ResponsesBridgeRuntime
  -> ProviderExchange builds provider request
  -> ProviderEdge calls upstream Chat Completions API
  -> bridge/response or bridge/stream reconstructs Responses output
  -> trace, logging, session persistence
```

`/v1/responses` is the main compatibility endpoint. `/v1/models` exposes configured model aliases. `/health` reports registered and unsupported providers.

## Bridge Kernel

`src/bridge/` owns shared Responses-to-Chat behavior. Keep provider-agnostic policy here.

- `compatibility/` plans supported, degraded, ignored, and rejected request features.
- `request/` normalizes Responses input and session history into Chat Completions messages.
- `tools/` plans tool declarations, `tool_choice`, degradation, identity mapping, and call restoration.
- `output/` plans structured-output contracts and validates strict downgraded JSON output.
- `response/` reconstructs sync `ResponseObject` results from provider responses.
- `stream/` maps provider deltas into Responses SSE events through a state machine.
- `provider-spec/` defines `ProviderSpec`, `ProviderEdge`, provider constants, and package shape checks.
- `finish-reason/` maps provider finish reasons to Responses terminal states.

Do not duplicate compatibility decisions in provider hooks. Provider hooks should expose protocol differences; the bridge decides support, downgrade, rejection, and diagnostics.

## Responses Pipelines

`src/responses/` owns orchestration around the bridge kernel.

- `ProviderExchange` builds provider requests, records trace request/event rows, and calls `ProviderEdge`.
- `SyncRequestPipeline` reconstructs the final `ResponseObject`, validates output contracts, records usage, logs diagnostics, and persists sessions.
- `StreamPipeline` translates provider SSE chunks to Responses SSE events, validates terminal output, logs usage, persists sessions, records trace events, and emits compatibility diagnostics.
- `stream-transforms/` contains composable `TransformStream` stages.

The stream pipeline order matters: provider events are bridged first, output contracts are validated before logging and persistence, then SSE encoding happens in the server route.

## Provider Pattern

Each built-in provider uses a compact ProviderSpec package:

```text
src/providers/<name>/
  spec.ts       Capabilities, endpoint, auth, tool codec, accessors, hooks
  client.ts     create<Name>ProviderEdge(config)
  hooks.ts      Provider-specific request patching, usage, finish reason, stream deltas
  protocol/     Provider-specific Chat Completions DTOs
  index.ts      Barrel exports
```

Shared provider utilities belong in `src/providers/shared/`.

When adding or changing a provider:

- Declare capabilities in `spec.ts`.
- Use `CHAT_COMPLETIONS_PROTOCOL` and `BEARER_AUTH` from `src/bridge/provider-spec`.
- Use `ChatProviderClient` for HTTP calls unless there is a clear provider-specific transport reason.
- Add or update provider conformance tests.
- Keep provider-specific DTOs under `protocol/`.
- Do not add mapper forests or wrapper contracts.

Built-in runtime providers are currently registered in `deepseek`, then `zhipu` order. `src/providers/example` is a spec example, not a runtime provider.

## Configuration

`godex.yaml` is parsed into `GodeXConfig`.

Important sections:

- `server.port`, `server.host`, `server.idle_timeout`
- `default_provider`
- `models.aliases`, where values must be `provider/model`
- `providers.<name>.spec`
- `providers.<name>.credentials.api_key`
- `providers.<name>.endpoint.base_url`
- `providers.<name>.timeout_ms`
- `session.backend`, either `memory` or `sqlite`
- `logging.level`, plus optional console/file logging
- `trace.enabled`, `trace.path`, queue/batch settings, and payload capture

Environment interpolation supports values such as `${DEEPSEEK_API_KEY}` and `${ZHIPU_API_KEY}` in config files. CLI overrides include `--port`, `--host`, `--config`, and `--log-level`.

Legacy provider config without `spec` is intentionally rejected.

## Sessions And Trace

Sessions:

- `previous_response_id` is a parent pointer, not a mutable conversation cursor.
- Session chain resolution detects missing parents, cycles, depth overflow, and incomplete responses.
- `store: false` skips persistence for the current turn.
- Session stores must keep API-shaped snapshots; provider-specific chat conversion belongs in the bridge.

Trace:

- Trace is enabled by default and stores rows in SQLite.
- Request, usage, event, and error records share request/response/provider/model metadata.
- Payload capture is summarized by default; `trace.capture_payload: true` stores payload JSON up to the configured byte limit.
- Treat captured payloads as sensitive.

## Error Handling

Use the `GodeXError` hierarchy from `src/error/`:

- `ServerError` for route/request/config validation
- `BridgeError` for Responses-to-Chat compatibility and reconstruction errors
- `ProviderError` for upstream HTTP/fetch failures
- `SessionError` for session chain and persistence errors

Use domain codes from `src/error/codes.ts`. Adapter, provider, bridge, and server code should not throw raw `Error` for expected runtime failures.

## Code Style

- TypeScript strict mode, ESNext target, ESM modules.
- `verbatimModuleSyntax` is enabled; use `import type` for types.
- Biome controls formatting and linting; tabs are the expected indentation style.
- Tests use Bun's built-in test runner and are usually colocated as `*.test.ts`.
- Use camelCase for variables/functions and PascalCase for classes/interfaces/types.
- Prefer small focused modules and explicit data boundaries over broad utility buckets.
- Add comments only when they explain why a non-obvious decision exists.

## Git Workflow

- Main branch: `main`.
- PRs target `main`.
- CI runs typecheck, Biome, unit/integration tests, mocked E2E, coverage, and native binary compilation.
- Live Zhipu tests run only on push to `main` when `ZHIPU_API_KEY` is configured.
- PR titles should use concise conventional style such as `fix: ...`, `feat: ...`, `docs: ...`, or `refactor: ...`.

## Boundaries

Always:

- Run `bun run check` before commits that change source or tests.
- Run `bun run test:e2e` for route, provider, session, stream, trace, or CLI runtime behavior changes.
- Keep shared Responses-to-Chat policy in `src/bridge`.
- Keep orchestration in `src/responses`.
- Keep provider-specific quirks in provider `hooks.ts` or protocol DTOs.
- Add tests for behavior changes.

Ask first:

- Adding a new provider implementation.
- Changing `ProviderSpec` or `ProviderEdge` contracts.
- Changing `GodeXConfig` schema.
- Reordering stream pipeline transformers.
- Changing trace payload retention semantics.
- Adding runtime dependencies.

Never:

- Recreate `src/adapter/mapper`, `src/adapter/provider.ts`, or provider-specific mapper forests.
- Duplicate compatibility decisions across providers.
- Bypass the `GodeXError` hierarchy for expected failures.
- Commit secrets, API keys, local trace databases, or session databases.
- Hand-edit generated build output.
- Add another test framework.
