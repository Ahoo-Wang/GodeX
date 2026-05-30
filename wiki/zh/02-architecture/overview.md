---
title: "系统总览"
description: "GodeX 的高层架构 — 组件模型、依赖关系与设计模式。"
keywords: "GodeX, 架构, 系统总览, 组件模型, 设计模式"
---

# 系统总览

GodeX 采用分层架构，关注点清晰分离：协议处理在边界层，桥接逻辑在中间层，提供商特定代码封装在 spec 和 hooks 中。

## 架构全景

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

## 组件模型

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

[请求流程](/zh/02-architecture/request-flow)

