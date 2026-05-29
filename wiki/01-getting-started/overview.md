---
title: "Overview"
description: "Introduction to GodeX — what it is, why it exists, and how to get started."
keywords: "GodeX, getting started, overview, OpenAI, Responses API, gateway"
---

# Overview

GodeX is an **OpenAI Responses API gateway** built with [Bun](https://bun.sh) and **TypeScript**. It translates standard `/v1/responses` requests into upstream Chat Completions API calls, allowing any LLM provider to serve as a backend for tools that speak the OpenAI protocol — including the Codex CLI.

## Why GodeX?

- **Protocol translation**: Tools like Codex expect the OpenAI Responses API, but many providers only offer Chat Completions. GodeX bridges this gap.
- **Provider-agnostic**: A spec-based provider system means adding a new provider requires declaring capabilities and writing small hooks, not rewriting the server.
- **Streaming-first**: The entire pipeline is built around `ReadableStream` and `TransformStream`, ensuring low-latency SSE delivery to clients.
- **Session history**: Built-in `previous_response_id` chain resolution with SQLite or in-memory backends.

## System Context

```mermaid
C4Context
  title GodeX — System Context

  Person(user, "Developer / Codex CLI", "Sends Responses API requests via the OpenAI-compatible endpoint")
  System(godex_svr, "GodeX Server", "Translates Responses API to Chat Completions API. Bun HTTP server on configurable port")
  SystemDb(sessions, "Session Store", "Stores response history for previous_response_id chain resolution. SQLite or In-Memory")
  SystemDb(trace, "Trace DB", "Records request, usage, event, and error rows in SQLite")
  System_Ext(deepseek, "DeepSeek", "Chat Completions API provider")
  System_Ext(zhipu, "Zhipu", "Chat Completions API provider")
  System_Ext(other, "Custom Provider", "Any Chat Completions compatible backend")

  Rel(user, godex_svr, "POST /v1/responses, GET /v1/models, GET /health", "HTTP/SSE")
  Rel(godex_svr, sessions, "save / resolve chains")
  Rel(godex_svr, trace, "record request, usage, events, errors")
  Rel(godex_svr, deepseek, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, zhipu, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, other, "POST /chat/completions", "HTTPS")
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Bun runtime | Native `ReadableStream`, fast startup, built-in SQLite |
| Bridge kernel | Clean separation between protocol translation and provider logic |
| Immutable capability sets | Prevent runtime mutation of provider feature flags |
| Session store abstraction | Swap between memory and SQLite without touching business logic |
| Composable stream transformers | Each concern (trace, log, persist, validate) is a separate stage |

## Project Structure

```
src/
├── cli/              Commander CLI (serve, config, init)
├── config/           godex.yaml schema, env interpolation, defaults
├── context/          ApplicationContext (DI), ResponsesContext (per-request)
├── bridge/           Provider-agnostic Responses-to-Chat bridge kernel
│   ├── compatibility/  Parameter and response-format compatibility planning
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
│   └── shared/        Shared provider utilities (ChatProviderClient, etc.)
├── responses/        Sync and stream orchestration pipelines
│   └── stream-transforms/  Composable TransformStream stages
├── server/           Bun routes for /health, /v1/models, /v1/responses
├── resolver/         ModelResolver (model selector to provider + model)
├── session/          Memory and SQLite response session stores
├── trace/            SQLite trace recorder and usage/error/event mappers
├── error/            GodeXError hierarchy with domain codes
├── protocol/         OpenAI protocol type definitions
├── tools/            Built-in tool definitions (shell, apply_patch, etc.)
└── e2e/              End-to-end tests with mocked upstream
```

[Installation & Setup](/01-getting-started/installation-setup)
