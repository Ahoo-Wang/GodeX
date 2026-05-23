---
title: "System Overview"
description: "High-level architecture of GodeX — component model, dependency graph, and design patterns."
keywords: "GodeX, architecture, system overview, component model, design patterns"
---

# System Overview

GodeX follows a layered architecture with clear separation of concerns: protocol handling at the boundary, adapter logic in the middle, and provider-specific code isolated in plugins.

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
    +logger: Logger
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
    +list() string[]
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
    +get(id) Promise~StoredResponseSession~
    +save(session, opts) Promise~void~
    +resolveChain(id, opts) Promise~ResponseSessionSnapshot~
    +delete(id) Promise~void~
    +close() Promise~void~
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

## Layer Responsibilities

| Layer | Module | Role |
|-------|--------|------|
| Server | `src/server/` | HTTP routing, SSE encoding, request validation |
| Context | `src/context/` | Per-request orchestration via `ResponsesContext` |
| Adapter | `src/adapter/` | Protocol translation between Responses API and provider |
| Provider | `src/providers/` | Provider-specific request/response/stream mapping |
| Session | `src/session/` | History persistence and `previous_response_id` chain resolution |
| Config | `src/config/` | YAML schema, env interpolation, defaults |
| Error | `src/error/` | Structured error hierarchy with domain codes |

## Dependency Flow

```mermaid
flowchart TD
  Server["Server (Routes)"]
  CTX["ApplicationContext"]
  RCTX["ResponsesContext"]
  Resolver["ModelResolver"]
  Reg["Registrar"]
  Adapt["DefaultAdapter"]
  Prov["Provider"]
  Store["SessionStore"]

  Server --> CTX
  Server --> RCTX
  RCTX --> Resolver
  RCTX --> Reg
  RCTX --> Store
  Server --> Adapt
  Adapt --> Prov
  Adapt --> Store
  Reg --> Prov
```

[Request Flow](/02-architecture/request-flow)
