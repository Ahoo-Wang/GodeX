---
title: Architecture Overview
description: End-to-end request lifecycle in GodeX, from CLI startup through the bridge to upstream providers and back.
---

# Architecture Overview

GodeX is a gateway that translates OpenAI **Responses API** requests into **Chat Completions API** calls for any configured upstream provider. Understanding the full request lifecycle is essential for debugging compatibility issues, adding new providers, or extending the bridge. This page traces a single request from the moment the Bun server receives it to the point where the reconstructed response is returned to the caller.

## At a Glance

| Layer | Component | Responsibility |
|-------|-----------|----------------|
| CLI | `serve` | Bootstraps config, registrar, `ApplicationContext`, and Bun server |
| Application | `ApplicationContext` | Holds config, resolver, registrar, session store, trace recorder |
| Application | `ApplicationServices` | Factory that wires logger, `ModelResolver`, `Registrar`, `ResponsesBridgeRuntime` |
| Server | `createBuiltinRoutes` | Maps `/health`, `/v1/models`, `/v1/responses` to handlers |
| Route | `handleResponses` | Parses request, creates `ResponsesContext`, dispatches |
| Context | `ResponsesContext` | Per-request state: resolved model, provider, session, diagnostics |
| Bridge | `ProviderExchange` | Builds Chat Completion request, calls upstream, records traces |
| Bridge | `ResponsesBridgeRuntime` | Selects sync or stream pipeline |
| Provider | `Registrar` | Manages `ProviderEdge` factories and resolved instances |
| Resolver | `ModelResolver` | Maps model selectors to `(provider, model)` pairs |

## Request Lifecycle

```mermaid
flowchart TD
    A["CLI serve()"] --> B["loadRuntimeConfig()"]
    B --> C["createBuiltinRegistrar()"]
    C --> D["new ApplicationContext(config, registrar)"]
    D --> E["createBuiltinRoutes(app)"]
    E --> F["Bun.serve(routes)"]

    F --> G["POST /v1/responses"]
    G --> H["parseResponseRequest(req)"]
    H --> I["createResponsesContext(app, body)"]
    I --> J["ModelResolver.resolve(model)"]
    I --> K["resolveResponsesSession()"]
    I --> L["Registrar.resolve(provider)"]
    J --> M["ResponsesContext"]
    K --> M
    L --> M
    M --> N["dispatchResponseRequest(ctx, app)"]

    N --> O{"ctx.request.stream?"}
    O -- Yes --> P["ResponsesBridgeRuntime.stream(ctx)"]
    O -- No --> Q["ResponsesBridgeRuntime.request(ctx)"]
    P --> R["ProviderExchange.stream(ctx)"]
    Q --> S["ProviderExchange.request(ctx)"]

    S --> T["buildChatCompletionRequest()"]
    T --> U["planBridgeCompatibility()"]
    T --> V["planTools()"]
    T --> W["planOutputContract()"]
    T --> X["normalizeCurrentInput()"]
    T --> Y["buildChatMessages()"]
    T --> Z["applyTools() + applyRequestOptions()"]

    Z --> AA["ctx.provider.request(chatReq)"]
    AA --> AB["reconstructResponseObject()"]
    AB --> AC["Response.json(responseObject)"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style M fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style T fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style AA fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style AC fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Core Types

```mermaid
classDiagram
    class ApplicationContext {
        +config: GodeXConfig
        +logger: Logger
        +resolver: ModelResolver
        +registrar: Registrar
        +responses: ResponsesBridge
        +sessionStore: ResponseSessionStore
        +traceRecorder: TraceRecorder
        +close() Promise~void~
    }

    class ModelResolver {
        -defaultProvider: string
        -aliases: ModelAliasCatalog
        +resolve(model) ResolvedModel
        +listAliases(registeredProviders) ModelAliasEntry[]
    }

    class Registrar {
        -factories: Map~ProviderFactory~
        -providers: Map~ProviderEdge~
        +registerFactory(name, factory) void
        +registerDefinition(definition) void
        +registerProviders(configs, logger) ProviderRegistrationResult
        +resolve(name) ProviderEdge
        +list() string[]
    }

    class ResponsesContext {
        +app: ApplicationContext
        +request: ResponseCreateRequest
        +session: ResponseSessionSnapshot
        +resolved: ResolvedModel
        +provider: ProviderEdge
        +requestId: string
        +responseId: string
        +diagnostics: CompatibilityDiagnostic[]
        +outputContract: OutputContractSlot
        +addDiagnostic(diagnostic) void
    }

    class ResponsesBridgeRuntime {
        -syncPipeline: ResponsesSyncPipeline
        -streamPipeline: ResponsesStreamPipeline
        +request(ctx) Promise~ResponseObject~
        +stream(ctx) Promise~ReadableStream~
    }

    class ProviderExchange {
        +request(ctx) Promise~ProviderRequestExchangeResult~
        +stream(ctx) Promise~ProviderStreamExchangeResult~
    }

    ApplicationContext --> ModelResolver
    ApplicationContext --> Registrar
    ApplicationContext --> ResponsesBridgeRuntime : responses
    ResponsesBridgeRuntime --> ProviderExchange
    ResponsesContext --> ApplicationContext : app
    ResponsesContext --> ProviderEdge : provider

    style ApplicationContext fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ModelResolver fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Registrar fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ResponsesContext fill:#2d333b,stroke:#6d5dfc,color:#e6ed3
    style ResponsesBridgeRuntime fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ProviderExchange fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Startup Sequence

```mermaid
sequenceDiagram
    autonumber
    participant CLI as serve()
    participant Config as loadRuntimeConfig
    participant Reg as createBuiltinRegistrar
    participant App as ApplicationContext
    participant Svc as createApplicationServices
    participant Server as Bun.serve

    CLI->>Config: loadRuntimeConfig(opts, runtime)
    Config-->>CLI: config + configPath
    CLI->>Reg: createBuiltinRegistrar()
    Reg-->>CLI: registrar with provider factories
    CLI->>App: new ApplicationContext(config, registrar)
    App->>Svc: createApplicationServices(config, registrar)
    Note over Svc: Creates Logger, ModelResolver,<br>Registrar, ResponsesBridgeRuntime,<br>SessionStore, TraceRecorder
    Svc-->>App: ApplicationServices
    CLI->>Server: startServer(deps)
    Note over Server: Bun.serve on host:port<br>with /health, /v1/models, /v1/responses
    Server-->>CLI: server handle
    CLI->>CLI: registerShutdownHandlers(server, app.close)
```

## Request Processing Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server as Bun.serve
    participant Handler as handleResponses
    participant Factory as createResponsesContext
    participant Resolver as ModelResolver
    participant Registrar as Registrar
    participant Dispatch as dispatchResponseRequest
    participant Runtime as ResponsesBridgeRuntime
    participant Exchange as ProviderExchange
    participant Provider as ProviderEdge

    Client->>Server: POST /v1/responses
    Server->>Handler: handleResponses(req, app)
    Handler->>Handler: parseResponseRequest(req)
    Handler->>Factory: createResponsesContext(app, body)
    Factory->>Resolver: resolve(request.model)
    Resolver-->>Factory: ResolvedModel
    Factory->>Registrar: resolve(providerName)
    Registrar-->>Factory: ProviderEdge
    Factory-->>Handler: ResponsesContext
    Handler->>Dispatch: dispatchResponseRequest(ctx, app)
    alt stream request
        Dispatch->>Runtime: app.responses.stream(ctx)
        Runtime->>Exchange: exchange.stream(ctx)
        Exchange->>Exchange: buildChatCompletionRequest
        Exchange->>Provider: provider.stream(chatReq)
        Provider-->>Exchange: SSE stream
    else sync request
        Dispatch->>Runtime: app.responses.request(ctx)
        Runtime->>Exchange: exchange.request(ctx)
        Exchange->>Exchange: buildChatCompletionRequest
        Exchange->>Provider: provider.request(chatReq)
        Provider-->>Exchange: provider response
    end
    Exchange-->>Dispatch: reconstructed ResponseObject
    Dispatch-->>Client: Response JSON / SSE stream
```

## Bridge Pipeline Detail

The bridge pipeline inside `ProviderExchange` follows a fixed sequence. Each step contributes decisions and data that downstream steps consume:

| Step | Function | Output |
|------|----------|--------|
| 1 | `planBridgeCompatibility` | Compatibility plan with parameter decisions |
| 2 | `planTools` | Tool declarations, tool_choice, tool decisions |
| 3 | `planOutputContract` | Response format plan (native, degraded, or synthetic) |
| 4 | `normalizeCurrentInput` + `normalizeResponseItems` | Normalized `ChatCompletionMessageParam[]` |
| 5 | `buildChatMessages` | Merged assistant messages with tool calls |
| 6 | `applyTools` | `request.tools` and `request.tool_choice` |
| 7 | `applyRequestOptions` | stream, temperature, top_p, max_tokens, reasoning |

```mermaid
flowchart LR
    subgraph Bridge Pipeline
        direction LR
        A["planBridge<br>Compatibility"] --> B["planTools"]
        B --> C["planOutput<br>Contract"]
        C --> D["normalize<br>Input"]
        D --> E["buildChat<br>Messages"]
        E --> F["applyTools"]
        F --> G["applyRequest<br>Options"]
    end

    G --> H["provider.request()<br>or provider.stream()"]
    H --> I["reconstructResponse<br>Object()"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style E fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style G fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Cross-References

- **[Compatibility](./compatibility.md)**: How the bridge plans feature compatibility before building a request
- **[Request Building](./request-building.md)**: Step-by-step conversion from Responses to Chat Completions
- **[Response Reconstruction](./response-reconstruction.md)**: How upstream responses are mapped back to the Responses API shape

## References

- [src/cli/serve.ts:12-62](https://github.com/Ahoo-Wang/GodeX/blob/main/src/cli/serve.ts#L12-L62) -- CLI entry point, server bootstrap, and shutdown handlers
- [src/context/application-context.ts:10-40](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-context.ts#L10-L40) -- `ApplicationContext` class holding all shared services
- [src/context/application-services.ts:1-48](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-services.ts#L1-L48) -- Factory wiring logger, resolver, registrar, bridge runtime
- [src/server/server.ts:21-51](https://github.com/Ahoo-Wang/GodeX/blob/main/src/server/server.ts#L21-L51) -- Route map creation and Bun server startup
- [src/server/routes/responses/handler.ts:1-33](https://github.com/Ahoo-Wang/GodeX/blob/main/src/server/routes/responses/handler.ts#L1-L33) -- Responses route handler with parse, context creation, and dispatch
- [src/responses/runtime.ts:19-41](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19-L41) -- `ResponsesBridgeRuntime` delegating to sync and stream pipelines
- [src/responses/provider-exchange.ts:1-123](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L1-L123) -- `ProviderExchange` orchestrating request building and upstream calls
- [src/providers/registrar.ts:1-95](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/registrar.ts#L1-L95) -- Provider factory registration and resolution
- [src/resolver/model-resolver.ts:1-37](https://github.com/Ahoo-Wang/GodeX/blob/main/src/resolver/model-resolver.ts#L1-L37) -- Model selector parsing and alias resolution
