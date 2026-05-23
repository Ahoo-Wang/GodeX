---
title: "请求流程"
description: "/v1/responses 请求在 GodeX 中的端到端生命周期。"
keywords: "GodeX, 请求流程, 序列图, ResponsesContext, ModelResolver"
---

# 请求流程

本页跟踪请求从 HTTP 入口到 SSE 编码响应的完整生命周期。

## 完整请求生命周期

```mermaid
sequenceDiagram
    autonumber
  actor C as 客户端
  participant R as 路由器
  participant AC as ApplicationContext
  participant RC as ResponsesContext
  participant MR as ModelResolver
  participant SS as SessionStore
  participant REG as Registrar
  participant A as DefaultAdapter
  participant PM as ProviderMapper
  participant CC as ChatClient
  participant UP as 上游 API

  C->>R: POST /v1/responses
  R->>RC: ResponsesContext.create(app, body)

  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: {provider, model}
    RC->>RC: 验证提供商配置

    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: 会话快照
    end

    RC->>REG: resolve(provider)
    REG-->>RC: Provider 实例
  deactivate RC

  alt stream = true
    R->>A: adapter.stream(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: 上游请求
      A->>CC: streamChat(req)
      CC->>UP: POST (SSE)
      UP-->>CC: SSE 数据块
      CC-->>A: ReadableStream
      A->>A: pipeTransform: ProviderEventToResponse
      A->>A: pipeTransform: SessionPersistence
      A-->>R: ReadableStream of ResponseStreamEvent
    deactivate A
    R->>R: pipeTransform: ResponseSseEncode
    R-->>C: SSE 字节流
  else stream = false
    R->>A: adapter.request(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: 上游请求
      A->>CC: chat(req)
      CC->>UP: POST
      UP-->>CC: JSON 响应
      CC-->>A: 上游响应
      A->>PM: response.map(ctx, res)
      PM-->>A: ResponseObject
      A->>SS: save(session)
      A-->>R: ResponseObject
    deactivate A
    R-->>C: JSON 响应
  end
```

## 关键步骤

1. **模型解析**：`ModelResolver.resolve()` 解析模型字符串。包含 `/` 时，左侧为提供商名称；否则使用默认提供商。模型名称通过提供商的 `models` 表映射。

2. **会话链解析**：当存在 `previous_response_id` 时，`SessionStore.resolveChain()` 沿父指针链遍历，按时间顺序收集对话轮次。

3. **提供商查找**：`Registrar.resolve()` 返回已构建的 `Provider` 实例。

4. **请求映射**：`RequestMapper.map()` 将 Responses API 请求转换为提供商原生格式。

5. **响应映射**：单次 `ResponseMapper.map()` 调用（非流式）或 `StreamMapper.map()` 管道（流式）。

[适配器模式](/zh/02-architecture/adapter-pattern)
