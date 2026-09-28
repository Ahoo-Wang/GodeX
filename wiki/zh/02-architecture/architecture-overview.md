---
title: 架构概览
description: GodeX 架构 — 端到端请求生命周期、组件模型、层级职责与依赖关系。
keywords: "GodeX, 架构, 系统总览, 组件模型, 请求生命周期, 设计模式"
---

# 架构概览

GodeX 是一个网关，将 OpenAI **Responses API** 请求转换为 **Chat Completions API** 调用，支持任何已配置的上游 Provider。它采用分层架构，关注点清晰分离：协议处理在边界层，桥接逻辑在中间层，提供商特定代码封装在 spec 和 hooks 中。

本页包含两个互补的视图：**请求生命周期**（单个请求如何在系统中流转）和 **组件模型**（构建块是什么、它们如何相互依赖）。理解两者对于调试兼容性问题、添加新 Provider 或扩展桥接层都至关重要。

## 概览

| 层级 | 组件 | 职责 |
|------|------|------|
| CLI | `serve` | 引导配置、注册器、`ApplicationContext` 和 Bun 服务器 |
| 应用 | `ApplicationContext` | 持有配置、解析器、注册器、会话存储、追踪记录器 |
| 应用 | `ApplicationServices` | 工厂，连接 logger、`ModelResolver`、`Registrar`、`ResponsesBridgeRuntime` |
| 服务器 | `createBuiltinRoutes` | 将 `/health`、`/v1/models`、`/v1/responses` 映射到处理函数 |
| 路由 | `handleResponses` | 解析请求，创建 `ResponsesContext`，分发 |
| 上下文 | `ResponsesContext` | 每请求状态：已解析的模型、Provider、会话、诊断信息 |
| 桥接 | `ProviderExchange` | 构建 Chat Completion 请求，调用上游，记录追踪 |
| 桥接 | `ResponsesBridgeRuntime` | 选择同步或流式管道 |
| Provider | `Registrar` | 管理 `ProviderEdge` 工厂和已解析的实例 |
| 解析器 | `ModelResolver` | 将模型选择器映射为 `(provider, model)` 对 |

## 请求生命周期

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

## 核心类型

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
    style ResponsesContext fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ResponsesBridgeRuntime fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ProviderExchange fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## 启动序列

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

## 请求处理序列

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

## 桥接管道详解

`ProviderExchange` 内部的桥接管道遵循固定的序列。每一步产生的决策和数据供下游步骤消费：

| 步骤 | 函数 | 输出 |
|------|------|------|
| 1 | `planBridgeCompatibility` | 兼容性计划，包含参数决策 |
| 2 | `planTools` | 工具声明、tool_choice、工具决策 |
| 3 | `planOutputContract` | 响应格式计划（原生、降级或合成） |
| 4 | `normalizeCurrentInput` + `normalizeResponseItems` | 标准化的 `ChatCompletionMessageParam[]` |
| 5 | `buildChatMessages` | 合并后的助手消息（含工具调用） |
| 6 | `applyTools` | `request.tools` 和 `request.tool_choice` |
| 7 | `applyRequestOptions` | stream、temperature、top_p、max_tokens、reasoning |

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

## 系统组件

完整的请求路径连接了每一层 —— 从 Bun 服务器路由，经过桥接请求构建器、Provider 边界，直到重建层：

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
  ClientHttp --> Upstream["Chat Completions upstream<br>DeepSeek, Zhipu, custom"]

  Upstream --> SyncRecon["bridge/response<br>reconstructResponseObject"]
  Upstream --> StreamRecon["bridge/stream<br>ResponseStreamStateMachine"]
  SyncRecon --> ResponseJson["ResponseObject JSON"]
  StreamRecon --> StreamTransforms["stream transforms<br>validate, trace, log, persist, diagnostics"]
  StreamTransforms --> Sse["Responses SSE"]

  Ctx --> Trace["trace recorder<br>request, usage, event, error rows"]
  Ctx --> Logger["structured logger"]
```

核心领域类型及其关系：

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

## 层级职责

| 层级 | 模块 | 职责 |
|------|------|------|
| Server | `src/server/` | HTTP 路由、请求解析、SSE 编码、错误处理 |
| Context | `src/context/` | `ApplicationContext`（应用级服务）和 `ResponsesContext`（请求级状态） |
| Bridge | `src/bridge/` | 与提供商无关的 Responses-to-Chat 规划与重建 |
| Responses | `src/responses/` | 同步和流式编排管道 |
| Provider | `src/providers/` | 提供商 spec、hooks、客户端和注册表 |
| Session | `src/session/` | 历史持久化和 `previous_response_id` 链式解析 |
| Resolver | `src/resolver/` | 模型别名和 provider/model 选择器解析 |
| Config | `src/config/` | YAML 模式、环境变量插值、默认值 |
| Error | `src/error/` | 结构化错误层次与域代码 |

## 依赖流

```mermaid
flowchart TD
  Server["Server (路由)"]
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

## 交叉引用

- **[兼容性](./compatibility.md)**：桥接如何在构建请求前规划功能兼容性
- **[请求构建](./request-building.md)**：从 Responses API 到 Chat Completions API 的逐步转换
- **[响应重建](./response-reconstruction.md)**：上游响应如何映射回 Responses API 格式

## 参考

- [src/cli/serve.ts:12-62](https://github.com/Ahoo-Wang/GodeX/blob/main/src/cli/serve.ts#L12-L62) -- CLI 入口点、服务器引导和关闭处理
- [src/context/application-context.ts:10-40](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-context.ts#L10-L40) -- `ApplicationContext` 类，持有所有共享服务
- [src/context/application-services.ts:1-48](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/application-services.ts#L1-L48) -- 工厂，连接 logger、解析器、注册器、桥接运行时
- [src/server/server.ts:21-51](https://github.com/Ahoo-Wang/GodeX/blob/main/src/server/server.ts#L21-L51) -- 路由映射创建和 Bun 服务器启动
- [src/server/routes/responses/handler.ts:1-33](https://github.com/Ahoo-Wang/GodeX/blob/main/src/server/routes/responses/handler.ts#L1-L33) -- Responses 路由处理函数，包含解析、上下文创建和分发
- [src/responses/runtime.ts:19-41](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19-L41) -- `ResponsesBridgeRuntime` 委派同步和流式管道
- [src/responses/provider-exchange.ts:1-166](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L1-L166) -- `ProviderExchange` 编排请求构建和上游调用
- [src/providers/registrar.ts:1-95](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/registrar.ts#L1-L95) -- Provider 工厂注册和解析
- [src/resolver/model-resolver.ts:1-37](https://github.com/Ahoo-Wang/GodeX/blob/main/src/resolver/model-resolver.ts#L1-L37) -- 模型选择器解析和别名解析
