---
title: "请求流程"
description: "/v1/responses 请求在 GodeX 中的端到端旅程。"
keywords: "GodeX, 请求流程, 序列图, ResponsesContext, ProviderExchange"
---

# 请求流程

本页追踪一个请求从 HTTP 入口到 SSE 编码响应的完整生命周期。

## 完整请求生命周期

```mermaid
sequenceDiagram
    autonumber
  actor C as 客户端
  participant R as 路由
  participant AC as ApplicationContext
  participant RC as ResponsesContext
  participant MR as ModelResolver
  participant SS as SessionStore
  participant REG as Registrar
  participant RT as ResponsesBridgeRuntime
  participant EX as ProviderExchange
  participant BR as bridge/request
  participant PE as ProviderEdge
  participant UP as 上游 API

  C->>R: POST /v1/responses
  R->>R: 解析并验证 JSON
  R->>RC: createResponsesContext(app, body)

  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: {provider, model}
    RC->>RC: 验证提供商配置

    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: 会话快照
    end

    RC->>REG: resolve(provider)
    REG-->>RC: ProviderEdge
  deactivate RC

  alt stream = true
    R->>RT: runtime.stream(ctx)
    activate RT
      RT->>EX: exchange.stream(ctx)
      activate EX
        EX->>BR: buildChatCompletionRequest(ctx)
        BR-->>EX: chat 请求 + 兼容性/工具/输出规划
        EX->>PE: stream(providerRequest)
        PE->>UP: POST (SSE)
        UP-->>PE: SSE 数据块
        PE-->>EX: 提供商 SSE 流
      deactivate EX
      RT->>RT: 通过 ResponseStreamStateMachine 桥接增量
      RT->>RT: 验证输出合约
      RT->>RT: 追踪、日志、持久化会话
      RT-->>R: ReadableStream of ResponseStreamEvent
    deactivate RT
    R->>R: SSE 编码
    R-->>C: text/event-stream
  else stream = false
    R->>RT: runtime.request(ctx)
    activate RT
      RT->>EX: exchange.request(ctx)
      activate EX
        EX->>BR: buildChatCompletionRequest(ctx)
        BR-->>EX: chat 请求 + 兼容性/工具/输出规划
        EX->>PE: request(providerRequest)
        PE->>UP: POST
        UP-->>PE: JSON 响应
        PE-->>EX: 提供商响应
      deactivate EX
      RT->>RT: 重建 ResponseObject
      RT->>RT: 验证输出合约
      RT->>RT: 记录追踪使用量、日志诊断
      RT->>SS: 保存会话（除非 store=false）
      RT-->>R: ResponseObject
    deactivate RT
    R-->>C: JSON
  end
```

## 关键步骤

1. **请求解析**：`parseResponseRequest()` 验证 JSON 封装并返回结构化请求体或错误响应。

2. **上下文创建**：`createResponsesContext()` 解析模型、验证提供商配置、可选地解析会话链，并从注册器解析 `ProviderEdge`。

3. **模型解析**：`ModelResolver.resolve()` 解析模型字符串。如果包含 `/`，则作为显式 `provider/model` 选择器。否则在 `models.aliases` 映射中查找（精确匹配、`*` 通配符、`default_provider` 回退）。

4. **会话链解析**：当存在 `previous_response_id` 时，`SessionStore.resolveChain()` 沿父指针链遍历，按时间顺序收集回合。

5. **提供商查找**：`Registrar.resolve()` 返回已构建的 `ProviderEdge`。

6. **请求构建**：Bridge 内核中的 `buildChatCompletionRequest()` 规划兼容性、工具和输出合约，然后规范化消息。

7. **响应重建**：同步管道通过 `reconstructResponseObject()` 重建 `ResponseObject`。流式管道通过 `ResponseStreamStateMachine` 映射增量。

[Bridge 内核](/zh/02-architecture/bridge-kernel)
