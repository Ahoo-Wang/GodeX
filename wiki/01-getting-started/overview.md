---
title: Overview
description: GodeX is an OpenAI-compatible Responses API gateway that bridges non-OpenAI LLM providers through their Chat Completions endpoints, enabling any model to act as a Codex engine.
---

# Overview

GodeX bridges the gap between the OpenAI Responses API and the diverse ecosystem of non-OpenAI large language model providers. Instead of rewriting every client SDK to speak each provider's proprietary protocol, you point your OpenAI-compatible tooling at GodeX and it transparently translates requests and responses behind the scenes. This eliminates vendor lock-in and lets teams switch or combine LLM providers with a single configuration change.

## At a Glance

| Aspect | Detail |
|---|---|
| **What** | OpenAI-compatible Responses API gateway |
| **Protocol** | Accepts OpenAI Responses API; translates to Chat Completions |
| **Runtime** | Built on Bun for high-performance HTTP serving |
| **Built-in Providers** | DeepSeek, Zhipu, MiniMax |
| **Session Backends** | In-memory, SQLite |
| **Configuration** | YAML file with `${VAR}` environment interpolation |
| **CLI** | `godex init` wizard, `godex serve` runtime |
| **Observability** | Built-in trace recorder with payload capture |

## Architecture

GodeX is organized as a layered gateway where each layer has a single responsibility: CLI parsing, configuration building, provider registration, request bridging, and response reconstruction.

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        CLI["CLI<br>(Commander)"]
        HTTP["HTTP Client<br>(curl / SDK)"]
    end

    subgraph Server["Server Layer"]
        Router["Bun.serve<br>Route Map"]
        Health["/health"]
        Models["/v1/models"]
        Responses["/v1/responses"]
    end

    subgraph Bridge["Bridge Kernel"]
        ReqBuilder["Request Builder"]
        Compat["Compatibility Plan"]
        ToolPlan["Tool Planning"]
        OutContract["Output Contract"]
    end

    subgraph Providers["Provider Layer"]
        DeepSeek["DeepSeek<br>Edge"]
        Zhipu["Zhipu<br>Edge"]
        MiniMax["MiniMax<br>Edge"]
    end

    HTTP --> Router
    CLI --> Router
    Router --> Health
    Router --> Models
    Router --> Responses
    Responses --> ReqBuilder
    ReqBuilder --> Compat
    ReqBuilder --> ToolPlan
    ToolPlan --> OutContract
    OutContract --> DeepSeek
    OutContract --> Zhipu
    OutContract --> MiniMax

    style Client fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Server fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Bridge fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Providers fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Router fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ReqBuilder fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Compat fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ToolPlan fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style OutContract fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style DeepSeek fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Zhipu fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MiniMax fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style CLI fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style HTTP fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Health fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Models fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Responses fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Request Lifecycle

Every incoming request follows a deterministic path through the system. The bridge kernel validates compatibility, plans tool transformations, dispatches to the correct provider edge, and then reconstructs the response into the OpenAI Responses API format.

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Server as Bun.serve
    participant Pipeline as SyncRequestPipeline
    participant Exchange as ProviderExchange
    participant Bridge as Request Builder
    participant Provider as Provider Edge

    Client->>Server: POST /v1/responses
    Server->>Pipeline: request(ctx)
    Pipeline->>Exchange: request(ctx)
    Exchange->>Bridge: buildChatCompletionRequest()
    Bridge-->>Exchange: BuildResult (compat + tools + output)
    Exchange->>Provider: provider.request(body)
    Provider-->>Exchange: ProviderResponse
    Exchange-->>Pipeline: ExchangeResult
    Pipeline->>Pipeline: reconstructResponseObject()
    Pipeline->>Pipeline: validateOutputContract()
    Pipeline->>Pipeline: saveSession()
    Pipeline-->>Server: ResponseObject
    Server-->>Client: JSON 200
```

The `SyncRequestPipeline` orchestrates this flow: it delegates to `ProviderExchange`, which calls `buildChatCompletionRequest` to translate the incoming Responses API payload into a Chat Completions request tailored to the target provider's capabilities ([src/responses/sync-request-pipeline.ts:31-46](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L31-L46)).

## Provider Spec Contract

Every provider implements the `ProviderSpec` interface, which defines a uniform contract for capabilities, endpoint configuration, authentication, tool name translation, and response/stream accessors ([src/bridge/provider-spec/contract.ts:54-74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts#L54-L74)).

| Contract Field | Purpose |
|---|---|
| `name` | Unique provider identifier (e.g. `deepseek`) |
| `protocol` | Always `chat_completions` |
| `capabilities` | Declares supported parameters, tools, formats |
| `endpoint` | Default base URL |
| `auth` | Authentication scheme (always Bearer) |
| `toolName` | Codec for translating tool names between API and provider |
| `response` | Accessors for extracting text, usage, finish reason |
| `stream` | Accessor for extracting deltas from SSE chunks |
| `hooks` | Optional `patchRequest`, `normalizeResponse`, `normalizeChunk` |

```mermaid
classDiagram
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

    class ProviderEdge {
        +name: string
        +spec: ProviderSpec
        +request(body): Promise~Response~
        +stream(body): Promise~ReadableStream~
    }

    class ProviderDefinition {
        +name: string
        +create(config): ProviderEdge
    }

    ProviderEdge --> ProviderSpec : uses
    ProviderDefinition --> ProviderEdge : creates
```

## Session Management

GodeX supports multi-turn conversations by persisting responses and replaying previous messages when a client sends `previous_response_id`. Two backends are available:

| Backend | Description | Default |
|---|---|---|
| `memory` | In-process map; lost on restart | Yes |
| `sqlite` | File-based persistence via SQLite | Opt-in |

Session configuration is parsed in [src/config/sections/session.ts:5-27](https://github.com/Ahoo-Wang/GodeX/blob/main/src/config/sections/session.ts#L5-L27) and the store is created during `ApplicationContext` initialization ([src/context/application-context.ts:20-30](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-context.ts#L20-L30)).

## Compatibility Planning

Before any request reaches a provider, the bridge kernel builds a **compatibility plan** that checks every requested parameter, tool type, and response format against the provider's declared capabilities. Unsupported features are either degraded to a compatible alternative or rejected with a diagnostic ([src/bridge/compatibility/compatibility-plan.ts:38-50](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/compatibility/compatibility-plan.ts#L38-L50)).

```mermaid
flowchart LR
    subgraph Input["Incoming Request"]
        Params["Parameters"]
        Tools["Tools"]
        Format["Response Format"]
        Reasoning["Reasoning"]
    end

    subgraph Plan["Compatibility Plan"]
        ParamCheck["Parameter Check"]
        ToolCheck["Tool Degradation"]
        FormatCheck["Format Validation"]
        ReasonCheck["Reasoning Mapping"]
    end

    subgraph Output["Decisions"]
        Supported["Supported"]
        Degraded["Degraded"]
        Ignored["Ignored"]
        Rejected["Rejected"]
    end

    Params --> ParamCheck
    Tools --> ToolCheck
    Format --> FormatCheck
    Reasoning --> ReasonCheck
    ParamCheck --> Supported
    ParamCheck --> Ignored
    ToolCheck --> Degraded
    ToolCheck --> Rejected
    FormatCheck --> Supported
    FormatCheck --> Rejected
    ReasonCheck --> Supported

    style Input fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Plan fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Output fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Params fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Tools fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Format fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Reasoning fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ParamCheck fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ToolCheck fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style FormatCheck fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ReasonCheck fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Supported fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Degraded fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Ignored fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Rejected fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Streaming Pipeline

For streaming requests, the `StreamPipeline` wires together multiple `TransformStream` stages: raw SSE ingestion, event bridging, output contract validation, trace recording, logging, session persistence, and compatibility diagnostics ([src/responses/stream-pipeline.ts:37-85](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L37-L85)).

```mermaid
flowchart LR
    SSE["Upstream SSE"] --> Trace1["Trace Raw"]
    Trace1 --> Bridge["Stream Event Bridge"]
    Bridge --> Error["Error Handler"]
    Error --> Validate["Output Contract"]
    Validate --> Trace2["Trace Transformed"]
    Trace2 --> Log["Response Logger"]
    Log --> Session["Session Persistence"]
    Session --> CompatLog["Compat Diagnostics"]

    style SSE fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Trace1 fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Bridge fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Error fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Validate fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Trace2 fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Log fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Session fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style CompatLog fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Next Steps

| Topic | Description |
|---|---|
| [Quick Start](./quick-start.md) | Install GodeX and make your first API call |
| [Configuration](./configuration.md) | Full `godex.yaml` reference |
| [Built-in Providers](./builtin-providers.md) | DeepSeek, Zhipu, and MiniMax comparison |

## References

- [src/index.ts:1-5](https://github.com/Ahoo-Wang/GodeX/blob/main/src/index.ts#L1-L5) - CLI entry point
- [package.json:1-75](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L1-L75) - Project metadata and scripts
- [src/bridge/provider-spec/contract.ts:54-74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts#L54-L74) - ProviderSpec interface
- [src/server/server.ts:21-27](https://github.com/Ahoo-Wang/GodeX/blob/main/src/server/server.ts#L21-L27) - Built-in route map
- [src/responses/runtime.ts:19-41](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19-L41) - ResponsesBridgeRuntime
- [src/bridge/compatibility/compatibility-plan.ts:38-50](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/compatibility/compatibility-plan.ts#L38-L50) - CompatibilityPlan interface
- [src/responses/sync-request-pipeline.ts:31-46](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L31-L46) - Sync request pipeline
- [src/responses/stream-pipeline.ts:37-85](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L37-L85) - Stream pipeline
- [src/context/application-context.ts:10-40](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-context.ts#L10-L40) - Application context
