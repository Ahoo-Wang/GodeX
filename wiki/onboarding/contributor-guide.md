---
title: "Contributor Guide"
description: "Practical guide for developers contributing to GodeX."
keywords: "GodeX, contributor, development, getting started"
---

# Contributor Guide

Welcome to GodeX. This guide gets you from clone to first contribution.

## Setup

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
bun run check        # typecheck + lint + test
```

## Project Layout

```
src/
├── bridge/          Provider-agnostic Responses-to-Chat bridge kernel
│   ├── compatibility/  Parameter and response-format planning
│   ├── request/        Input normalization and message building
│   ├── tools/          Tool declarations, tool_choice, identity mapping
│   ├── output/         Structured-output contract planning and validation
│   ├── response/       Sync ResponseObject reconstruction
│   ├── stream/         Stream state machine and delta mapping
│   ├── provider-spec/  ProviderSpec, ProviderEdge, factory helpers
│   └── finish-reason/  Provider finish reason mapping
├── providers/        Provider registry, specs, hooks, clients
│   ├── deepseek/      DeepSeek provider
│   ├── zhipu/         Zhipu provider
│   ├── example/       Spec-only example provider
│   └── shared/        Shared utilities (ChatProviderClient, stream delta mapper)
├── responses/        Sync and stream orchestration pipelines
│   └── stream-transforms/  Composable TransformStream stages
├── server/           Bun routes (/health, /v1/models, /v1/responses)
├── context/          ApplicationContext and per-request ResponsesContext
├── resolver/         Model selector and alias resolution
├── session/          Memory and SQLite session stores
├── trace/            SQLite trace recorder
├── config/           godex.yaml parsing and validation
├── error/            GodeXError hierarchy with domain codes
├── protocol/         OpenAI protocol type definitions
├── tools/            Built-in tool definitions
├── cli/              Commander CLI
└── e2e/              End-to-end tests with mocked upstream
```

## Key Concepts

### Bridge Kernel

The bridge kernel (`src/bridge/`) is the provider-agnostic translation layer. It plans compatibility, builds Chat Completions requests, and reconstructs Responses API output. Never put provider-specific logic here.

### ProviderEdge

Each provider implements `ProviderEdge` — a combination of a `ProviderSpec` (capabilities, accessors, hooks) and HTTP methods (`request`, `stream`). Provider-specific logic belongs in `src/providers/<name>/`.

### Stream Pipeline

The streaming pipeline chains composable `TransformStream` stages: trace raw events, bridge deltas through the state machine, validate output contracts, trace transformed events, log, persist sessions, and log diagnostics.

## Development Workflow

```bash
bun run dev           # Hot-reload dev server on port 13145
bun run check         # typecheck + lint + test
bun run test:e2e      # End-to-end tests
bun run test:coverage # Coverage report
```

### Before Committing

- Run `bun run check` — must pass.
- Run `bun run test:e2e` if you changed routing, providers, sessions, streams, or trace behavior.
- Add tests for behavior changes.

## Error Handling

Use the `GodeXError` hierarchy from `src/error/`:

| Class | Domain | When |
|-------|--------|------|
| `ServerError` | `server` | Route/request/config validation |
| `BridgeError` | `bridge` | Compatibility, stream state, output contracts |
| `ProviderError` | `provider` | Upstream HTTP/fetch failures |
| `SessionError` | `session` | Chain and persistence errors |

Never throw raw `Error` for expected runtime failures.

## Adding a Provider

1. Create `src/providers/<name>/` with `spec.ts`, `client.ts`, `hooks.ts`, and `protocol/`.
2. Declare `ProviderSpec` with capabilities, accessors, and hooks.
3. Create `ProviderEdge` factory using `ChatProviderClient`.
4. Register in `src/providers/builtin.ts`.
5. Add conformance tests.

## Key Files

| Component | Path | Purpose |
|-----------|------|---------|
| `ProviderSpec` | [src/bridge/provider-spec/contract.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts) | Provider interface contract |
| `buildChatCompletionRequest` | [src/bridge/request/request-builder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/request/request-builder.ts) | Bridge request building |
| `ResponseStreamStateMachine` | [src/bridge/stream/response-stream-state-machine.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/stream/response-stream-state-machine.ts) | Stream event state machine |
| `ResponsesBridgeRuntime` | [src/responses/runtime.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts) | Orchestration runtime |
| `StreamPipeline` | [src/responses/stream-pipeline.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts) | Stream orchestration |
| `SyncRequestPipeline` | [src/responses/sync-request-pipeline.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts) | Sync orchestration |

[Staff Engineer Guide](/onboarding/staff-engineer-guide)
