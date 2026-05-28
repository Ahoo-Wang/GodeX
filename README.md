<div align="center">

<img src="design/assets/01-logo-system/png/godex-logo-horizontal-transparent-800x233.png" alt="GodeX" width="480" />

**Make every model a Codex engine.**

OpenAI-compatible Responses API gateway — translates `/v1/responses` into upstream Chat Completions API calls, connecting Codex, CLI, IDE, and automation tools with any model provider.

[![npm version](https://img.shields.io/npm/v/@ahoo-wang/godex?logo=npm)](https://www.npmjs.com/package/@ahoo-wang/godex)
[![codecov](https://codecov.io/gh/Ahoo-Wang/GodeX/graph/badge.svg?token=dJQrmUAiXu)](https://codecov.io/gh/Ahoo-Wang/GodeX)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e0?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

[Getting Started](https://godex.ahoo.me/01-getting-started/overview) · [Architecture](https://godex.ahoo.me/02-architecture/overview) · [Configuration](https://godex.ahoo.me/07-configuration/config-schema) · [Documentation](https://godex.ahoo.me)

</div>

## Features

| | Feature | Description |
|---|---------|-------------|
| 🔄 | **Protocol Translation** | Bridges OpenAI Responses API and provider-specific Chat Completions APIs |
| 🔌 | **Provider-agnostic** | Plugin-based adapter system — add providers by implementing a small set of interfaces |
| ⚡ | **Streaming-first** | 4-stage `TransformStream` pipeline for low-latency SSE delivery |
| 💾 | **Session History** | Built-in `previous_response_id` chain resolution (SQLite / in-memory) |
| 🛡️ | **Structured Errors** | Domain-specific error hierarchy with structured codes and diagnostic context |
| 🔧 | **Built-in Tools** | `local_shell`, `shell`, `apply_patch` — Codex-compatible function tools |
| 📦 | **Standalone Binary** | Zero runtime dependencies, 6 platform builds via GitHub Actions |

## Quick Start

```bash
# Install — no Bun required at runtime
npm install -g @ahoo-wang/godex

# Create config interactively
godex init

# Start the gateway
godex serve
```

Point Codex CLI at your GodeX instance:

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value          # not validated by GodeX, must be set
codex
```

Or use the OpenAI SDK:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",
});

const response = await client.responses.create({
  model: "gpt-4o",          // resolved via models.aliases → zhipu/glm-4.7
  input: "Hello!",
});
```

## How It Works

```
Codex / CLI / IDE
      │
      ▼  POST /v1/responses
┌─────────────────────────────────────────┐
│              GodeX Gateway              │
│                                         │
│  Bun.serve → handleResponses()          │
│       → ResponsesContext.create()       │
│           → ModelResolver.resolve()     │
│           → Registrar.resolve()         │
│       → DefaultAdapter.stream/request() │
│           → ProviderMapper.map()        │
│           → ChatClient.streamChat()     │
│           → 4-stage TransformStream     │
│       → Response (JSON or SSE)          │
└──────────────┬──────────────────────────┘
               │  Provider Adapter
               ▼
┌─────────────────────────────────────────┐
│       Chat Completions-compatible API   │
│       (Zhipu, OpenAI, or custom)        │
└─────────────────────────────────────────┘
```

## Architecture

```mermaid
C4Context
  title GodeX — System Context

  Person(user, "Developer / Codex CLI", "Sends Responses API requests<br/>via the OpenAI-compatible endpoint")
  System(godex_svr, "GodeX Server", "Translates Responses API → Chat Completions API<br/>Bun.serve on configurable port")
  SystemDb(sessions, "Session Store", "Stores response history for<br/>previous_response_id chain resolution<br/>SQLite (persistent) or In-Memory")
  System_Ext(zhipu, "Zhipu (智谱)", "Chat Completions API provider")
  System_Ext(openai, "OpenAI", "Chat Completions API provider")
  System_Ext(other, "Custom Provider", "Any Chat Completions<br/>compatible backend")

  Rel(user, godex_svr, "POST /v1/responses, GET /v1/models, GET /health", "HTTP/SSE")
  Rel(godex_svr, sessions, "save / resolve chains")
  Rel(godex_svr, zhipu, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, openai, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, other, "POST /chat/completions", "HTTPS")
```

## Component Model

```mermaid
classDiagram
  direction TB

  class ApplicationContext {
    +config: GodeXConfig
    +logger: Logger
    +resolver: ModelResolver
    +registrar: Registrar
    +adapter: Adapter
    +sessionStore: ResponseSessionStore
  }

  class ResponsesContext {
    +app: ApplicationContext
    +request: ResponseCreateRequest
    +session: ResponseSessionSnapshot
    +resolved: ResolvedModel
    +provider: Provider
    +responseId: string
    +requestId: string
    +attributes: Map
    +create(app, body)$ Promise~ResponsesContext~
  }

  class ModelResolver {
    -defaultProvider: string
    -providerConfigs: Record
    +resolve(model) ResolvedModel
  }

  class Registrar {
    -factories: Map~string, ProviderFactory~
    +registerFactory(name, factory)
    +build(providers)
    +resolve(name) Provider
  }

  class Adapter {
    <<interface>>
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class DefaultAdapter {
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class Provider {
    <<interface>>
    +name: string
    +mapper: ProviderMapper
    +chatClient: ChatClient
    +capabilities: ProviderCapabilities
  }

  class ProviderMapper {
    <<interface>>
    +request: RequestMapper
    +response: ResponseMapper
    +stream: StreamMapper
  }

  class ChatClient {
    <<interface>>
    +chat(req) Promise~TRes~
    +streamChat(req) Promise~ReadableStream~
  }

  class ResponseSessionStore {
    <<interface>>
    +get(id) StoredResponseSession
    +save(session, opts)
    +resolveChain(id, opts) ResponseSessionSnapshot
    +delete(id)
    +close()
  }

  ApplicationContext --> ResponsesContext : creates
  ApplicationContext --> ModelResolver
  ApplicationContext --> Registrar
  ApplicationContext --> Adapter
  ApplicationContext --> ResponseSessionStore
  ResponsesContext --> Provider : uses
  Provider --> ProviderMapper
  Provider --> ChatClient
  Adapter <|.. DefaultAdapter
  DefaultAdapter --> ProviderMapper : calls
  DefaultAdapter --> ChatClient : calls
  DefaultAdapter --> ResponseSessionStore : saves
```

## Request Flow

```mermaid
sequenceDiagram
  actor C as Client (Codex CLI)
  participant H as handleResponses
  participant RC as ResponsesContext
  participant MR as ModelResolver
  participant SS as SessionStore
  participant REG as Registrar
  participant A as DefaultAdapter
  participant PM as ProviderMapper
  participant CC as ChatClient
  participant UP as Upstream API

  C->>H: POST /v1/responses
  H->>RC: ResponsesContext.create(app, body)
  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: { provider, model }
    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: session snapshot
    end
    RC->>REG: resolve(provider)
    REG-->>RC: Provider instance
  deactivate RC

  alt stream = true
    H->>A: adapter.stream(ctx)
    activate A
      A->>PM: mapper.request.map(ctx)
      A->>CC: chatClient.streamChat(req)
      CC->>UP: POST (SSE)
      UP-->>CC: SSE chunks
      A->>A: pipeTransform → ProviderEventToResponse
      A->>A: pipeTransform → ResponseLog
      A->>A: pipeTransform → ResponseSessionPersistence
    deactivate A
    H->>H: pipeTransform → ResponseSseEncode
    H-->>C: SSE byte stream
  else stream = false
    H->>A: adapter.request(ctx)
    activate A
      A->>PM: mapper.request.map(ctx)
      A->>CC: chatClient.chat(req)
      CC->>UP: POST
      UP-->>A: upstream response
      A->>PM: mapper.response.map(ctx, res)
      A->>SS: save(session)
    deactivate A
    H-->>C: JSON response
  end
```

## Stream Pipeline

```mermaid
flowchart LR
  subgraph upstream["Upstream Provider"]
    SSE["SSE Chunks"]
  end

  subgraph godex["GodeX Stream Pipeline"]
    T1["① ProviderEventToResponse"]
    T2["② ResponseLog"]
    T3["③ SessionPersistence"]
  end

  subgraph server["HTTP Response"]
    T4["④ SseEncode"]
  end

  subgraph client["Client"]
    BYTES["SSE Bytes"]
  end

  SSE -->|pipeThrough| T1
  T1 -->|map per event| T2
  T2 -->|log + pass through| T3
  T3 -->|accumulate + save session| T4
  T4 -->|serialize SSE wire format| BYTES

  style upstream fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
  style godex fill:#0f3460,stroke:#16213e,color:#e0e0e0
  style server fill:#1c2333,stroke:#16213e,color:#e0e0e0
  style client fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
```

| Stage | Transformer | Input | Output | Role |
|-------|------------|-------|--------|------|
| ① | `ProviderEventToResponseTransformer` | `JsonServerSentEvent` | `ResponseStreamEvent` | Maps upstream SSE chunks via `StreamMapper.map()` |
| ② | `ResponseLogTransformer` | `ResponseStreamEvent` | `ResponseStreamEvent` | Logs stream events for observability |
| ③ | `ResponseSessionPersistenceTransformer` | `ResponseStreamEvent` | `ResponseStreamEvent` | Accumulates `StreamState`, saves session on terminal event |
| ④ | `ResponseSseEncodeTransformer` | `ResponseStreamEvent` | `Uint8Array` | Serializes to `event:` / `data:` wire format |

## Project Structure

```
src/
├── cli/              Commander CLI (serve, config, init)
├── config/           godex.yaml schema, env interpolation, defaults
├── context/          ApplicationContext (DI), ResponsesContext (per-request)
├── adapter/          Adapter interface, DefaultAdapter, stream transformers
│   ├── mapper/       RequestMapper / ResponseMapper / StreamMapper contracts
│   └── transformers/ 4-stage stream pipeline (map → log → persist → encode)
├── providers/        Provider registry + builtin factories
│   └── zhipu/        Reference provider: mapper, chat-client, tools, messages
├── resolver/         ModelResolver (model selector → provider + model)
├── server/           Bun.serve, routes (/v1/responses, /health, /v1/models)
├── session/          ResponseSessionStore (Memory + SQLite), chain resolution
├── error/            GodeXError hierarchy with domain codes
├── tools/            Built-in function tools (local_shell, shell, apply_patch)
├── protocol/openai/  OpenAI-compatible type definitions
├── logger/           Structured JSON logger
└── e2e/              End-to-end tests with mocked upstream
```

## Configuration

### godex.yaml

```yaml
server:
  port: 5678

default_provider: zhipu

models:
  aliases:
    "gpt-4o": zhipu/glm-4.7   # model name mapping
    "*": zhipu/glm-5.1         # catch-all fallback

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/coding/paas/v4
  deepseek:
    api_key: ${DEEPSEEK_API_KEY}
    base_url: https://api.deepseek.com

session:
  backend: sqlite               # or "memory"
  sqlite:
    path: ./data/sessions.db

trace:
  enabled: true                 # records request/event/usage rows by default
  path: ./data/trace.db
  capture_payload: false        # false keeps only payload hash + byte size

logging:
  level: info                   # trace | debug | info | warn | error
```

### Model Selection

```
model: "gpt-4o"              → resolved via default_provider model mapping
model: "zhipu/glm-4.7"       → explicit provider/model selector
model: "deepseek/deepseek-v4-pro" → routes to configured DeepSeek provider
model: "openai/gpt-4o"       → routes to configured openai provider
```

### Health Check

```bash
curl http://localhost:5678/health
# {"status":"ok","providers":["zhipu","deepseek"],"unsupported_providers":[]}
```

### Adding a Provider

Implement three interfaces in `src/providers/<name>/`:

| Interface | Purpose |
|-----------|---------|
| `Provider` | Bundles mapper + chatClient + capabilities |
| `ProviderMapper` | request / response / stream mapping functions |
| `ChatClient` | `chat()` and `streamChat()` HTTP calls |

Register the factory in `src/providers/builtin.ts`:

```ts
registrar.registerFactory("myprovider", (config) =>
  createMyProvider(config) as Provider<unknown, unknown, unknown>
);
```

## Development

```bash
bun install                  # Install dependencies
bun run dev                  # Dev server with hot reload (port 13145)
bun run test                 # Unit + integration tests
bun run test:e2e             # E2E tests with mocked upstream
bun run build                # Build standalone binary for current platform
bun run check                # typecheck + lint + test
bun run ci                   # Full CI pipeline
```

## Publishing

`@ahoo-wang/godex` is a lightweight npm wrapper. Native binaries ship as platform-specific optional dependencies:

```
@ahoo-wang/godex
├── @ahoo-wang/godex-darwin-arm64     ← macOS Apple Silicon
├── @ahoo-wang/godex-darwin-x64       ← macOS Intel
├── @ahoo-wang/godex-linux-x64        ← Linux x86_64
├── @ahoo-wang/godex-linux-arm64      ← Linux ARM64
├── @ahoo-wang/godex-win32-x64        ← Windows x86_64
└── @ahoo-wang/godex-win32-arm64      ← Windows ARM64
```

## License

[Apache License 2.0](LICENSE)
