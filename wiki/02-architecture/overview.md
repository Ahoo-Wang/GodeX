---
title: "System Overview"
description: "High-level architecture of GodeX — component model, dependency graph, and design patterns."
keywords: "GodeX, architecture, system overview, component model, design patterns"
---

# System Overview

GodeX follows a layered architecture with clear separation of concerns: protocol handling at the boundary, bridge logic in the middle, and provider-specific code isolated in specs and hooks.

## Component Model

```mermaid
classDiagram
  direction TB

  class ApplicationContext {
    +config: GodeXConfig
    +logger: Logger
    +resolver: ModelResolver
    +registrar: Registrar
    +responses: ResponsesBridge
    +sessionStore: ResponseSessionStore
    +traceRecorder: TraceRecorder
  }

  class ResponsesContext {
    +app: ApplicationContext
    +request: ResponseCreateRequest
    +session: ResponseSessionSnapshot
    +resolved: ResolvedModel
    +provider: ProviderEdge
    +responseId: string
    +requestId: string
    +diagnostics: CompatibilityDiagnostic[]
    +attributes: Map
    +outputContract: OutputContractSlot
  }

  class ModelResolver {
    -defaultProvider: string
    -providerConfigs: Record
    +resolve(model) ResolvedModel
  }

  class Registrar {
    -factories: Map
    -providers: Map
    +registerDefinitions(definitions)
    +registerProviders(configs, logger)
    +resolve(name) ProviderEdge
    +list() string[]
    +unsupported() string[]
  }

  class ResponsesBridge {
    <<interface>>
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class ResponsesBridgeRuntime {
    -syncPipeline: SyncRequestPipeline
    -streamPipeline: StreamPipeline
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class ProviderEdge {
    <<interface>>
    +name: string
    +spec: ProviderSpec
    +request(body) Promise~TResponse~
    +stream(body) Promise~ReadableStream~
  }

  class ProviderSpec {
    +name: string
    +protocol: ProviderProtocol
    +capabilities: ProviderCapabilities
    +endpoint: ProviderEndpointSpec
    +auth: ProviderAuthSpec
    +toolName: ToolNameCodec
    +response: ChatCompletionResponseAccessor
    +stream: ChatCompletionStreamAccessor
    +hooks?: ProviderHooks
  }

  class ResponseSessionStore {
    <<interface>>
    +get(id) Promise~StoredResponseSession~
    +save(session, opts) Promise~void~
    +resolveChain(id, opts) Promise~ResponseSessionSnapshot~
    +delete(id) Promise~void~
    +close() void
  }

  ApplicationContext --> ResponsesContext : creates
  ApplicationContext --> ModelResolver
  ApplicationContext --> Registrar
  ApplicationContext --> ResponsesBridge
  ApplicationContext --> ResponseSessionStore
  ResponsesContext --> ProviderEdge : uses
  ProviderEdge --> ProviderSpec
  ResponsesBridge <|.. ResponsesBridgeRuntime
  ResponsesBridgeRuntime --> SyncRequestPipeline
  ResponsesBridgeRuntime --> StreamPipeline
```

## Layer Responsibilities

| Layer | Module | Role |
|-------|--------|------|
| Server | `src/server/` | HTTP routing, request parsing, SSE encoding, error handling |
| Context | `src/context/` | `ApplicationContext` (app-wide services) and `ResponsesContext` (per-request state) |
| Bridge | `src/bridge/` | Provider-agnostic Responses-to-Chat planning and reconstruction |
| Responses | `src/responses/` | Sync and stream orchestration pipelines around the bridge |
| Provider | `src/providers/` | Provider-specific specs, hooks, clients, and registry |
| Session | `src/session/` | History persistence and `previous_response_id` chain resolution |
| Resolver | `src/resolver/` | Model alias and provider/model selector resolution |
| Config | `src/config/` | YAML schema, env interpolation, defaults, validation |
| Error | `src/error/` | Structured error hierarchy with domain codes |

## Dependency Flow

```mermaid
flowchart TD
  Server["Server (Routes)"]
  CTX["ApplicationContext"]
  RCTX["ResponsesContext"]
  Resolver["ModelResolver"]
  Reg["Registrar"]
  Bridge["ResponsesBridgeRuntime"]
  Exchange["ProviderExchange"]
  Prov["ProviderEdge"]
  Store["SessionStore"]

  Server --> CTX
  Server --> RCTX
  RCTX --> Resolver
  RCTX --> Reg
  RCTX --> Store
  CTX --> Bridge
  Bridge --> Exchange
  Exchange --> Prov
  Reg --> Prov
```

[Request Flow](/02-architecture/request-flow)
