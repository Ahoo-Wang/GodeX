---
title: "系统总览"
description: "Godex 高层架构 — 组件模型、依赖关系图和设计模式。"
---

# 系统总览

Godex 采用分层架构，关注点清晰分离：协议处理在边界、适配器逻辑在中间、提供商特定代码隔离在插件中。

## 组件模型

```mermaid
classDiagram
  direction TB

  class ApplicationContext {
    +config: GodexConfig
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

  class ResponseSessionStore {
    <<interface>>
    +get(id) Promise~StoredResponseSession~
    +save(session, opts) Promise~void~
    +resolveChain(id, opts) Promise~ResponseSessionSnapshot~
    +delete(id) Promise~void~
    +close() Promise~void~
  }

  ApplicationContext --> ResponsesContext : 创建
  ApplicationContext --> ModelResolver
  ApplicationContext --> Registrar
  ApplicationContext --> Adapter
  ApplicationContext --> ResponseSessionStore
  ResponsesContext --> Provider : 使用
  Provider --> ProviderMapper
  Adapter <|.. DefaultAdapter
  DefaultAdapter --> ProviderMapper : 调用
  DefaultAdapter --> ResponseSessionStore : 保存
```

## 层级职责

| 层级 | 模块 | 职责 |
|------|------|------|
| 服务器 | `src/server/` | HTTP 路由、SSE 编码、请求验证 |
| 上下文 | `src/context/` | 通过 `ResponsesContext` 编排每请求流程 |
| 适配器 | `src/adapter/` | Responses API 与提供商之间的协议转换 |
| 提供商 | `src/providers/` | 提供商特定的请求/响应/流映射 |
| 会话 | `src/session/` | 历史持久化和 `previous_response_id` 链式解析 |
| 配置 | `src/config/` | YAML Schema、环境变量插值、默认值 |
| 错误 | `src/error/` | 带域代码的结构化错误层次 |

[请求流程](/zh/02-architecture/request-flow)
