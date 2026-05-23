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

## Quick Start

```bash
# Install — no Bun required at runtime
npm install -g @ahoo-wang/godex

# Create config interactively
godex init

# Start the gateway
godex serve
```

### Connect Codex CLI

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value          # not validated by GodeX, must be set
codex
```

### Use OpenAI SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",
});

const response = await client.responses.create({
  model: "gpt-4o",          // mapped to glm-4.7 via godex.yaml
  input: "Hello!",
});
```

## How It Works

```
Codex / CLI / IDE
      │
      ▼  POST /v1/responses
┌─────────────────┐
│   GodeX Gateway │
└────────┬────────┘
         │  Provider Adapter
         ▼
┌─────────────────────────┐
│  Chat Completions API   │
│  (any compatible model) │
└─────────────────────────┘
```

GodeX accepts OpenAI Responses API requests, translates them to Chat Completions API calls via pluggable provider adapters, and streams results back — preserving the full protocol semantics that Codex expects.

## Architecture

```mermaid
C4Context
  title GodeX — System Context

  Person(user, "Developer / Codex CLI", "Sends Responses API requests<br/>via the OpenAI-compatible endpoint")
  System(godex_svr, "GodeX Server", "Translates Responses API → Chat Completions API<br/>Bun HTTP server on configurable port")
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

> Full diagrams: [Request Flow](https://godex.ahoo.me/02-architecture/request-flow) · [Stream Pipeline](https://godex.ahoo.me/02-architecture/stream-pipeline) · [Component Model](https://godex.ahoo.me/02-architecture/adapter-pattern)

## Configuration

### godex.yaml

```yaml
server:
  port: 5678

default_provider: zhipu

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/coding/paas/v4
    models:
      "gpt-4o": glm-4.7         # model name mapping
      "*": glm-5.1              # catch-all fallback

session:
  backend: sqlite               # or "memory"
  sqlite:
    path: ./data/sessions.db

logging:
  level: info                   # trace | debug | info | warn | error
```

### Model Selection

```
model: "gpt-4o"              → resolved via default_provider model mapping
model: "zhipu/glm-4.7"       → explicit provider/model selector
model: "openai/gpt-4o"       → routes to configured openai provider
```

### Health Check

```bash
curl http://localhost:5678/health
# {"status":"ok","providers":["zhipu"],"unsupported_providers":[]}
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

## Project Structure

```
src/
├── cli/              Commander CLI (serve, config check, init)
├── config/           godex.yaml schema, env interpolation, defaults
├── context/          ApplicationContext (DI), ResponsesContext (per-request)
├── adapter/          Adapter interface, DefaultAdapter, stream transformers
│   ├── mapper/       RequestMapper / ResponseMapper / StreamMapper contracts
│   └── transformers/ ProviderEvent → Response → SSE encode pipeline
├── providers/        Provider registry + builtin factories
│   └── zhipu/        Reference provider: mapper, chat-client, tools, messages
├── resolver/         ModelResolver (model selector → provider + model)
├── server/           Bun HTTP server, routes (/v1/responses, /health, /v1/models)
├── session/          ResponseSessionStore (Memory + SQLite), chain resolution
├── error/            GodeXError hierarchy with domain codes
├── protocol/openai/  OpenAI-compatible type definitions
├── logger/           Structured JSON logger
└── e2e/              End-to-end tests with mocked upstream
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
