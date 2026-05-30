<div align="center">

<img src="design/assets/01-logo-system/png/godex-logo-horizontal-transparent-800x233.png" alt="GodeX" width="480" />

**Make every model a Codex engine.**

OpenAI-compatible Responses API gateway for coding models that expose Chat Completions APIs.

[![npm version](https://img.shields.io/npm/v/@ahoo-wang/godex?logo=npm)](https://www.npmjs.com/package/@ahoo-wang/godex)
[![codecov](https://codecov.io/gh/Ahoo-Wang/GodeX/graph/badge.svg?token=dJQrmUAiXu)](https://codecov.io/gh/Ahoo-Wang/GodeX)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e0?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

</div>

GodeX lets clients that speak the OpenAI Responses API use providers such as DeepSeek, MiniMax, and Zhipu through one local server.

## Highlights

- OpenAI-compatible `POST /v1/responses` endpoint with sync and streaming responses.
- `GET /v1/models` aliases so clients can use stable model names while GodeX routes to provider/model targets.
- Built-in bridge providers for DeepSeek, MiniMax, and Zhipu.
- Provider capability planning for request parameters, tools, `tool_choice`, structured output formats, reasoning, and stream usage.
- Responses `previous_response_id` session chains backed by memory or SQLite.
- Trace recording for provider requests, provider responses, stream events, usage, and errors.
- Native Bun runtime, TypeScript source, and compiled platform binaries for releases.

## Built-in Providers

| Provider | Reasoning | Tool Choice | Response Format | Cached Tokens | Default Model |
|----------|-----------|-------------|-----------------|---------------|---------------|
| DeepSeek | native | auto, none, required, function | text, json_object | ✅ | `deepseek-v4-pro` |
| MiniMax  | none  | auto, none, required, function | text, json_object | ✅ | `MiniMax-M2.7` |
| Zhipu    | boolean | auto, none | text, json_object | ✅ | `glm-5.1` |

## Architecture

```mermaid
flowchart TB
  Client["Client<br>Codex, SDK, CLI, IDE"] --> Routes["Bun server routes<br>/health<br>/v1/models<br>/v1/responses"]
  Routes --> Ctx["ResponsesContext<br>request id, response id, resolved model,<br>provider, session, diagnostics"]

  Ctx --> Resolver["ModelResolver<br>alias and provider/model selection"]
  Ctx --> Session["ResponseSessionStore<br>memory or SQLite<br>previous_response_id chains"]
  Ctx --> Registrar["Registrar<br>built-in ProviderEdge factories"]
  Ctx --> Runtime["ResponsesBridgeRuntime"]

  Runtime --> Sync["SyncRequestPipeline"]
  Runtime --> Stream["StreamPipeline"]
  Sync --> Exchange["ProviderExchange"]
  Stream --> Exchange

  Exchange --> Builder["bridge/request<br>buildChatCompletionRequest"]
  Builder --> Compat["bridge/compatibility<br>parameter and response-format decisions"]
  Builder --> Tools["bridge/tools<br>tool declarations, tool_choice,<br>identity restoration"]
  Builder --> Output["bridge/output<br>structured-output contract"]

  Exchange --> Edge["ProviderEdge<br>ProviderSpec + hooks"]
  Edge --> ClientHttp["ChatProviderClient<br>Fetcher HTTP boundary"]
  ClientHttp --> Upstream["Chat Completions upstream<br>DeepSeek, MiniMax, Zhipu, custom"]

  Upstream --> SyncRecon["bridge/response<br>reconstructResponseObject"]
  Upstream --> StreamRecon["bridge/stream<br>ResponseStreamStateMachine"]
  SyncRecon --> ResponseJson["ResponseObject JSON"]
  StreamRecon --> StreamTransforms["stream transforms<br>validate, trace, log, persist, diagnostics"]
  StreamTransforms --> Sse["Responses SSE"]

  Ctx --> Trace["trace recorder<br>request, usage, event, error rows"]
  Ctx --> Logger["structured logger"]
```

## Component Interaction

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant Server as /v1/responses route
  participant Context as ResponsesContext factory
  participant Resolver as ModelResolver
  participant Store as ResponseSessionStore
  participant Registrar
  participant Runtime as ResponsesBridgeRuntime
  participant Exchange as ProviderExchange
  participant Bridge as bridge/request
  participant Provider as ProviderEdge
  participant Upstream as Chat Completions API

  Client->>Server: POST /v1/responses
  Server->>Server: parse and validate JSON envelope
  Server->>Context: create(app, body)
  Context->>Resolver: resolve(body.model)
  Resolver-->>Context: provider + upstream model
  opt previous_response_id
    Context->>Store: resolveChain(previous_response_id)
    Store-->>Context: ordered session snapshot
  end
  Context->>Registrar: resolve(provider)
  Registrar-->>Context: ProviderEdge
  Server->>Runtime: request(ctx) or stream(ctx)
  Runtime->>Exchange: build and send provider request
  Exchange->>Bridge: buildChatCompletionRequest(ctx)
  Bridge-->>Exchange: chat request + compatibility/tool/output plans
  Exchange->>Provider: request(body) or stream(body)
  Provider->>Upstream: POST /chat/completions
  Upstream-->>Provider: JSON response or SSE chunks
  alt sync
    Provider-->>Exchange: provider response
    Exchange-->>Runtime: provider response + plans
    Runtime->>Store: save completed response unless store=false
    Runtime-->>Server: ResponseObject
    Server-->>Client: JSON
  else stream
    Provider-->>Exchange: provider SSE stream
    Exchange-->>Runtime: stream + plans
    Runtime->>Runtime: bridge deltas, validate output, trace, log, persist
    Runtime-->>Server: ResponseStreamEvent stream
    Server-->>Client: text/event-stream
  end
```

## Install

For local development:

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
```

For package use, install the published package and run the `godex` binary:

```bash
npm install -g @ahoo-wang/godex
godex --help
```

### Docker

Pre-built images are published to Docker Hub and GitHub Container Registry:

```bash
docker pull ahoowang/godex:latest
# or
docker pull ghcr.io/ahoo-wang/godex:latest
```

Run with a config file:

```bash
docker run -d \
  --name godex \
  -p 5678:5678 \
  -e ZHIPU_API_KEY=your-key \
  -e DEEPSEEK_API_KEY=your-key \
  -e MINIMAX_API_KEY=your-key \
  -v ./godex.yaml:/etc/godex/godex.yaml:ro \
  -v godex-data:/data \
  ahoowang/godex:latest
```

The image supports `linux/amd64` and `linux/arm64`.

- Config file: `/etc/godex/godex.yaml`
- Data directory (sessions, trace): `/data`
- Default port: `5678`

## Quick Start

Create a config interactively:

```bash
godex init
```

Or create `godex.yaml` manually:

```yaml
server:
  port: 5678
  host: 0.0.0.0

default_provider: deepseek

models:
  aliases:
    gpt-5.5: deepseek/deepseek-v4-pro
    glm: zhipu/glm-5.1
    "*": deepseek/deepseek-v4-flash

providers:
  deepseek:
    spec: deepseek
    credentials:
      api_key: ${DEEPSEEK_API_KEY}
    endpoint:
      base_url: https://api.deepseek.com
  zhipu:
    spec: zhipu
    credentials:
      api_key: ${ZHIPU_API_KEY}
    endpoint:
      base_url: https://open.bigmodel.cn/api/coding/paas/v4
  minimax:
    spec: minimax
    credentials:
      api_key: ${MINIMAX_API_KEY}
    endpoint:
      base_url: https://api.minimaxi.com/v1

session:
  backend: sqlite
  sqlite:
    path: ./data/sessions.db

logging:
  level: info

trace:
  enabled: true
  path: ./data/trace.db
  capture_payload: false
```

Start the server:

```bash
godex serve --config ./godex.yaml
```

During development you can run from source:

```bash
bun run dev
```

The dev command starts GodeX on port `13145`; the default runtime config port is `5678`.

## API

### Health

```bash
curl http://localhost:5678/health
```

### Models

```bash
curl http://localhost:5678/v1/models
```

`/v1/models` lists configured aliases, excluding the wildcard alias `*`.

### Responses

```bash
curl http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.5",
    "input": "Write a short TypeScript function that adds two numbers."
  }'
```

Streaming uses standard Responses SSE event names:

```bash
curl -N http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.5",
    "stream": true,
    "input": "Explain Bun streams in two sentences."
  }'
```

## Model Routing

Clients may pass either:

- A provider-qualified selector such as `deepseek/deepseek-v4-pro`
- A configured alias such as `gpt-5.5`
- A bare model name, which resolves through `default_provider` when no alias matches

Aliases must map to `provider/model` values, and the provider must exist in `providers`.

## Provider Bridge Behavior

GodeX builds a provider request in three steps:

1. Resolve the client model selector to a configured provider and upstream model.
2. Plan compatibility from the provider `ProviderSpec`, including request parameters, tool declarations, `tool_choice`, response format, reasoning, and stream usage.
3. Convert Responses input and session history into Chat Completions messages, call the upstream provider, and reconstruct a Responses object or Responses SSE stream.

Provider-specific differences belong in each provider's `spec.ts`, `hooks.ts`, protocol types, and HTTP client. Shared Responses-to-Chat policy belongs under `src/bridge`.

## Structured Output

When a provider supports `json_object` but not native `json_schema`, GodeX can degrade strict `json_schema` requests to `json_object`.

For strict downgraded schemas:

- The schema instruction is added to the provider prompt preamble for the current request.
- The provider receives `response_format: { "type": "json_object" }`.
- GodeX validates that the final output is valid JSON.
- Invalid sync output fails the response; invalid stream output is rewritten to a terminal `response.failed` event.

The validator checks JSON syntax, not full JSON Schema conformance.

## Sessions

Responses can be stored and replayed with `previous_response_id`.

- `session.backend: memory` keeps history in process memory.
- `session.backend: sqlite` persists history to SQLite.
- Requests with `store: false` are not saved.
- The session chain stores request snapshots and response output items, then rebuilds provider-neutral history on the next turn.

## Trace Database

Tracing is enabled by default and writes SQLite rows to `./data/trace.db` unless configured otherwise.

Trace records include:

- Provider request metadata
- Provider request and response bodies as summarized payloads
- Raw and transformed stream events
- Usage details, including cached tokens when provided by the upstream
- Route and provider errors

Set `trace.capture_payload: true` to persist payload JSON up to `trace.payload_max_bytes`. Keep it disabled for sensitive environments.

## Development

```bash
bun install                  # Install dependencies
bun run dev                  # Dev server with hot reload on port 13145
bun run start                # Start server from source
bun run build                # Build a binary for the current platform
bun run compile:all          # Cross-compile all supported platform packages
```

Quality gates:

```bash
bun run typecheck            # TypeScript
bun run lint                 # Biome check
bun run lint:fix             # Biome autofix
bun run format               # Biome format
bun run test                 # Unit and integration tests, excluding src/e2e
bun run test:e2e             # Mocked end-to-end tests
bun run test:zhipu           # Live Zhipu tests; requires ZHIPU_API_KEY
bun run test:deepseek        # Live DeepSeek tests; requires DEEPSEEK_API_KEY
bun run test:minimax         # Live MiniMax tests; requires MINIMAX_API_KEY
bun run check                # typecheck + lint + test
bun run ci                   # typecheck + biome ci + test + e2e
```

## Source Map

```text
src/
  cli/          Commander CLI, init wizard, runtime config loading
  config/       godex.yaml schema, defaults, env interpolation
  context/      ApplicationContext and per-request ResponsesContext
  bridge/       Provider-agnostic Responses-to-Chat planning and reconstruction
  providers/    Built-in provider specs, hooks, clients, and registry
  responses/    Sync and stream request pipelines
  server/       Bun routes for /health, /v1/models, /v1/responses
  session/      Memory and SQLite response session stores
  trace/        SQLite trace recorder and usage/error/event mappers
  protocol/     OpenAI protocol type definitions
  error/        GodeXError hierarchy and domain codes
```

## Provider Development

Provider folders follow this shape:

```text
src/providers/<name>/
  spec.ts       ProviderSpec declaration
  client.ts     ProviderEdge construction with ChatProviderClient
  hooks.ts      Provider-specific patching, accessors, usage, stream deltas
  protocol/     Provider DTOs when needed
  index.ts      Public exports
```

Add shared compatibility policy to `src/bridge`; add shared provider transport or protocol helpers to `src/providers/shared`.

## License

Apache-2.0. See [LICENSE](./LICENSE).
