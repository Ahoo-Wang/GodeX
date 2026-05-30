---
title: Streaming Pipeline
description: How GodeX composes a chain of transform streams to process provider SSE events into validated, logged, and persisted Responses API stream events.
---

# 流式管道

流式管道是 GodeX 最复杂的执行路径。它连接到提供者的 SSE 流，通过状态机将原始提供者增量映射为结构化的 `ResponseStreamEvent` 对象，然后通过可组合的转换流链传递，处理错误恢复、输出契约验证、可观测性追踪、日志记录、会话持久化和兼容性诊断。每个转换器只负责单一职责，使管道易于扩展和调试。

## 概览

| 关注点 | 组件 | 关键文件 |
|---------|-----------|----------|
| 管道编排器 | `StreamPipeline` | [stream-pipeline.ts:31](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L31) |
| 事件桥接 | `ProviderStreamEventBridge` | [stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88) |
| 错误处理器 | `wrapWithErrorHandler` | [stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34) |
| 追踪转换器 | `TraceTransformer` | [trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8) |
| 日志转换器 | `ResponseLogTransformer` | [response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13) |
| 契约验证 | `ResponseOutputContractValidationTransformer` | [response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13) |
| 会话持久化 | `ResponseSessionPersistenceTransformer` | [response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19) |
| SSE 编码器 | `ResponseSseEncoder` | [response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7) |
| 管道工具函数 | `pipeTransform` | [stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6) |

## 转换链

`StreamPipeline.stream` ([stream-pipeline.ts:37](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L37)) 构建一个通过 `pipeTransform` ([stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6)) 连接的 `TransformStream` 线性链：

```mermaid
flowchart LR
    subgraph "转换链"
        direction LR
        A["提供者 SSE<br>ReadableStream"] --> B["TraceTransformer<br>(原始事件)"]
        B --> C["ProviderStreamEventBridge<br>(增量到事件映射)"]
        C --> D["wrapWithErrorHandler<br>(错误恢复)"]
        D --> E["ResponseOutputContract<br>ValidationTransformer"]
        E --> F["TraceTransformer<br>(转换后事件)"]
        F --> G["ResponseLogTransformer"]
        G --> H{"store = false?"}
        H -->|是| I["CompatibilityLogTransformer"]
        H -->|否| J["ResponseSessionPersistence<br>Transformer"]
        J --> I
        I --> K["输出<br>ReadableStream"]
    end

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style E fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style G fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style J fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style K fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

| 阶段 | 类 | 用途 |
|-------|-------|---------|
| 1 | `TraceTransformer("upstream.stream.event.raw")` | 记录原始提供者 SSE 事件用于追踪 |
| 2 | `ProviderStreamEventBridge` | 通过状态机将提供者增量映射为 `ResponseStreamEvent` |
| 3 | `wrapWithErrorHandler` | 将上游错误转换为 `response.failed` 事件 |
| 4 | `ResponseOutputContractValidationTransformer` | 在终止事件上验证 JSON 输出契约 |
| 5 | `TraceTransformer("upstream.stream.event.transformed")` | 记录转换后事件用于追踪 |
| 6 | `ResponseLogTransformer` | 记录包含使用量指标的流完成日志 |
| 7 | `ResponseSessionPersistenceTransformer` | 持久化响应会话（如果 `store !== false`） |
| 8 | `CompatibilityLogTransformer` | 在流结束时记录兼容性诊断 |

## 提供者流事件桥接

`ProviderStreamEventBridge` ([stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88)) 是将原始提供者 SSE 事件转换为结构化响应事件的核心转换器。它：

1. 创建一个带有请求工具身份映射的 `ResponseStreamStateMachine`
2. 对每个 SSE 事件，使用 `ctx.provider.spec.stream.deltas(event.data)` 提取增量，并通过 `mapProviderDeltasToEvents` 以 `deferTerminal: true` 传入
3. 在流结束时（`flush`），通过调用 `machine.finish(machine.deferredFinishReason)` 发出延迟的终止事件

```mermaid
sequenceDiagram
    autonumber
    participant SSE as 提供者 SSE
    participant B as ProviderStreamEventBridge
    participant M as ResponseStreamStateMachine
    participant D as mapProviderDeltasToEvents

    SSE->>B: JsonServerSentEvent(data)
    B->>B: provider.spec.stream.deltas(data)
    B->>D: mapProviderDeltasToEvents(machine, deltas, deferTerminal=true)
    D->>M: start() / text() / toolCall() / deferFinish()
    D-->>B: ResponseStreamEvent[]
    B-->>SSE: 入队事件

    Note over SSE,B: 流结束
    SSE->>B: flush()
    B->>M: finish(deferredFinishReason)
    M-->>B: 终止事件
    B-->>SSE: 入队终止事件
```

`deferTerminal: true` 标志至关重要：它阻止状态机立即转换到终止阶段，给下游转换器（尤其是输出契约验证器）一个检查并可能重写终止事件的机会。

## 错误处理器

`wrapWithErrorHandler` ([stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34)) 将事件流包装在一个捕获读取错误的 `ReadableStream` 中。当错误发生时：

1. 通过 `recordTraceError` 记录错误
2. 如果状态机仍处于 `IDLE` 或 `IN_PROGRESS` 阶段，发出 `machine.start()`（如果需要）然后发出 `machine.fail(error)`
3. 如果 `fail()` 调用本身抛出已知的流生命周期错误（例如已处于终止状态），以 debug 级别记录日志
4. 错误处理期间的意外失败以 warn 级别记录
5. 干净地关闭流

```mermaid
flowchart TD
    A["发生上游错误"] --> B{"machine.phase?"}
    B -->|"IDLE / IN_PROGRESS"| C["如果 IDLE 则发出 start()"]
    C --> D["发出 fail(error)"]
    D --> E{"fail() 是否抛出异常?"}
    E -->|"已知流错误码"| F["以 debug 级别记录"]
    E -->|"意外错误"| G["以 warn 级别记录"]
    B -->|"COMPLETED / FAILED / INCOMPLETE"| H["终止后错误<br>已处理"]
    F --> I["controller.close()"]
    G --> I
    H --> I

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

## 各转换器详解

### TraceTransformer

`TraceTransformer<T>` ([trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8)) 是一个通用的直通转换器，在追踪启用时（`ctx.app.traceEnabled`）将每个数据块记录为追踪事件。它跟踪一个序列号用于有序的追踪回放。

### ResponseLogTransformer

`ResponseLogTransformer` ([response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13)) 统计事件数，在遇到终止事件（`response.completed`、`response.failed`、`response.incomplete`）时记录完成日志。它记录使用量指标和上游延迟。

### ResponseOutputContractValidationTransformer

此转换器 ([response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13)) 在终止事件上验证 JSON 输出契约。如果验证失败，它将事件重写为 `response.failed` 并抑制后续事件。详见 [Output Contracts](./output-contracts.md)。

### ResponseSessionPersistenceTransformer

`ResponseSessionPersistenceTransformer` ([response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19)) 在遇到终止事件时持久化响应会话。它使用 `persistenceAttempted` 标志确保只执行一次保存尝试。当 `ctx.request.store === false` 时 ([stream-pipeline.ts:74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L74))，此阶段完全跳过。

### CompatibilityLogTransformer

`CompatibilityLogTransformer` ([compatibility-log-transformer.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/compatibility-log-transformer.ts#L7)) 是最后一个转换器。它在终止事件到达或 flush 时记录所有累积的兼容性诊断，确保即使流异常关闭也能发出诊断信息。

## 上游延迟追踪

管道通过 `ctx.attributes.set(ATTR_UPSTREAM_LATENCY_MILLIS, ...)` 在 [stream-pipeline.ts:42](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L42) 记录上游延迟（连接到提供者流的时间）到 `upstreamLatencyMillis`。该值稍后包含在 `ResponseLogTransformer` 的完成日志中。

## SSE 编码

转换链之后，`ResponseSseEncoder` ([response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7)) 将每个 `ResponseStreamEvent` 转换为 SSE 帧（`event: type\ndata: JSON\n\n`），带有自增的序列号。

## 交叉引用

- [Stream Reconstruction](./stream-reconstruction.md) -- `ProviderStreamEventBridge` 内部使用的状态机和增量到事件映射
- [Sync Pipeline](./sync-pipeline.md) -- 更简单的非流式对应管道
- [Output Contracts](./output-contracts.md) -- 转换链中使用的验证逻辑
- [Tool Planning](./tool-planning.md) -- 生成事件桥接使用的 `ToolIdentityMap`

## 参考

- [stream-pipeline.ts:31](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L31) -- `StreamPipeline` 类
- [stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88) -- `ProviderStreamEventBridge` 类
- [stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34) -- `wrapWithErrorHandler` 函数
- [trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8) -- `TraceTransformer` 类
- [response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13) -- `ResponseLogTransformer` 类
- [response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13) -- 契约验证转换器
- [response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19) -- 会话持久化转换器
- [stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6) -- `pipeTransform` 工具函数
- [response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7) -- `ResponseSseEncoder` 类
