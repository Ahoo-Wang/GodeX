---
title: 追踪系统
description: GodeX 的追踪系统将请求生命周期事件（请求、使用量、事件、错误）记录到 SQLite，通过异步批量记录器实现，支持可配置的负载捕获和大小限制。
---

# 追踪系统

可观测性对任何 LLM 网关都至关重要。GodeX 的追踪系统捕获整个请求生命周期中的每个请求、token 使用量事件、流式事件和错误，将它们持久化到 SQLite 用于离线分析。系统专为生产吞吐量设计：`AsyncTraceRecorder` 在队列中批量处理事件，并定期或在批量大小阈值达到时刷新，使热路径免于磁盘 I/O。当追踪被禁用时，`NoopTraceRecorder` 以零开销替代真实的记录器。

追踪系统通过 `TraceRecordingContext` 附加到 `ResponsesContext`，因此任何有权访问上下文的代码都可以发出追踪记录，而无需了解存储后端。

## 概览

| 组件 | 文件 | 用途 |
|---|---|---|
| `TraceRecorder` | [recorder.ts:5-8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts#L5) | 核心接口（`record`、`close`） |
| `AsyncTraceRecorder` | [recorder.ts:30-110](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts#L30) | 基于队列的批量记录器 |
| `NoopTraceRecorder` | [recorder.ts:25-28](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts#L25) | 追踪禁用时的零操作记录器 |
| `SQLiteTraceStore` | [sqlite.ts:69-297](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/sqlite.ts#L69) | 具有四张表的 SQLite 存储 |
| `TraceRecordEvent` | [types.ts:70-74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/types.ts#L70) | 所有记录类型的联合类型 |
| `mapTraceRecordToRow` | [row-mapper.ts:16-98](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/row-mapper.ts#L16) | 将事件转换为存储行 |
| `summarizePayload` | [payload.ts:10-35](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/payload.ts#L10) | SHA-256 哈希、字节数、可选 JSON 捕获 |
| `TraceRecordingContext` | [context.ts:4-12](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/context.ts#L4) | 附加到每个请求的上下文 |
| `createTraceServices` | [trace-services.ts:15-34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/trace-services.ts#L15) | 基于配置的工厂函数 |

## 架构概览

```mermaid
flowchart TD
    subgraph ctx["Request Context"]
        tctx["TraceRecordingContext<br>requestId, responseId, resolved"]
    end

    subgraph helpers["Recording Helpers"]
        rr["recordTraceRequest"]
        ru["recordTraceUsage"]
        re["recordTraceEvent"]
        rer["recordTraceError"]
    end

    subgraph recorder["AsyncTraceRecorder"]
        queue["Event Queue"]
        flush["Flush (batch)"]
    end

    subgraph storage["SQLiteTraceStore"]
        tr["trace_requests"]
        tu["trace_usage"]
        te["trace_events"]
        terr["trace_errors"]
    end

    tctx --> rr
    tctx --> ru
    tctx --> re
    tctx --> rer
    rr -->|"record(event)"| queue
    ru -->|"record(event)"| queue
    re -->|"record(event)"| queue
    rer -->|"record(event)"| queue
    queue -->|"batch size / interval"| flush
    flush -->|"insertBatch(rows)"| storage
    flush --> tr
    flush --> tu
    flush --> te
    flush --> terr

    style ctx fill:#161b22,stroke:#30363d,color:#e6edf3
    style helpers fill:#161b22,stroke:#30363d,color:#e6edf3
    style recorder fill:#161b22,stroke:#30363d,color:#e6edf3
    style storage fill:#161b22,stroke:#30363d,color:#e6edf3
    style tctx fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style rr fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ru fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style re fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style rer fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style queue fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style flush fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style tr fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style tu fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style te fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style terr fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## TraceRecorder 接口

`TraceRecorder` 接口（[recorder.ts:5-8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts#L5)）设计上保持最小化：

| 方法 | 描述 |
|---|---|
| `record(event)` | 将追踪事件入队等待持久化 |
| `close()` | 刷新剩余事件并释放资源 |

## AsyncTraceRecorder

生产环境记录器（[recorder.ts:30-110](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts#L30)）使用内存队列，具有两个刷新触发器：

```mermaid
sequenceDiagram
    autonumber
    participant Helper as Recording Helper
    participant Recorder as AsyncTraceRecorder
    participant Queue as Event Queue
    participant Store as SQLiteTraceStore

    Helper->>Recorder: record(event)
    Recorder->>Queue: push(event)
    alt Queue full (>= maxQueueSize)
        Recorder-->>Recorder: warn("trace.queue.full"), drop event
    else Queue size >= batchSize
        Recorder->>Recorder: scheduleFlush()
    end

    Note over Recorder: Timer fires every flushIntervalMs
    Recorder->>Recorder: flush()
    Recorder->>Queue: splice(0, batchSize)
    Queue-->>Recorder: batch[]
    Recorder->>Recorder: mapTraceRecordToRow(batch)
    Recorder->>Store: insertBatch(rows)
    Store-->>Recorder: done
    alt More events in queue
        Recorder->>Recorder: flush() again
    end

```

### 配置选项

| 选项 | 类型 | 描述 |
|---|---|---|
| `maxQueueSize` | `number` | 队列中的最大事件数；溢出时丢弃 |
| `batchSize` | `number` | 每次刷新的事件数量 |
| `flushIntervalMs` | `number` | 自动刷新的定时器间隔 |
| `store` | `TraceStoreWriter` | 存储后端（通常是 `SQLiteTraceStore`） |
| `logger` | `TraceRecorderLogger` | 用于记录丢弃和错误警告 |
| `capturePayload` | `boolean` | 是否存储完整的 JSON 负载 |
| `payloadMaxBytes` | `number` | 存储负载的字节限制 |

## SQLiteTraceStore

SQLite 存储（[sqlite.ts:69-297](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/sqlite.ts#L69)）在构造时自动迁移四张表：

### 数据库 Schema

```mermaid
erDiagram
    trace_requests {
        INTEGER id PK
        TEXT request_id
        TEXT response_id
        TEXT provider
        TEXT model
        INTEGER stream
        INTEGER created_at
        TEXT requested_prompt_cache_key
        TEXT payload_hash
        INTEGER payload_bytes
        TEXT payload_json
        INTEGER payload_truncated
    }

    trace_usage {
        INTEGER id PK
        TEXT request_id
        TEXT response_id
        TEXT provider
        TEXT model
        INTEGER created_at
        INTEGER input_tokens
        INTEGER output_tokens
        INTEGER total_tokens
        INTEGER cached_tokens
        INTEGER reasoning_tokens
        REAL cache_hit_ratio
    }

    trace_events {
        INTEGER id PK
        TEXT request_id
        TEXT response_id
        TEXT event_name
        INTEGER sequence
        INTEGER created_at
        TEXT payload_hash
        INTEGER payload_bytes
        TEXT payload_json
        INTEGER payload_truncated
    }

    trace_errors {
        INTEGER id PK
        TEXT request_id
        TEXT response_id
        TEXT provider
        TEXT model
        TEXT event_name
        TEXT error_type
        TEXT domain
        TEXT code
        TEXT message
        INTEGER status
        INTEGER created_at
        TEXT payload_hash
        INTEGER payload_bytes
        TEXT payload_json
        INTEGER payload_truncated
    }

    style trace_requests fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style trace_usage fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style trace_events fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style trace_errors fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

批量插入包装在事务中（[sqlite.ts:90-95](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/sqlite.ts#L90)）以确保原子性。在 `request_id`、`response_id`、`event_name` 和 `code` 上创建索引以优化常见查询模式。

## 追踪记录类型

`TraceRecordEvent` 联合类型（[types.ts:70-74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/types.ts#L70)）有四种变体：

| 类型 | 接口 | 关键字段 |
|---|---|---|
| `request` | `TraceRequestRecordEvent` | `stream`、`requested_prompt_cache_key`、`payload` |
| `usage` | `TraceUsageRecordEvent` | `usage`（input_tokens、output_tokens、total_tokens、cached_tokens、reasoning_tokens、cache_hit_ratio） |
| `event` | `TraceEventRecordEvent` | `event_name`、`sequence`、`payload` |
| `error` | `TraceErrorRecordEvent` | `event_name`、`error_type`、`domain`、`code`、`message`、`status`、`payload` |

所有变体共享 `TraceRecordBase`（[types.ts:19-25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/types.ts#L19)），包含 `request_id`、`response_id`、`provider`、`model` 和 `created_at`。

### 事件名称

`TraceEventRecordEvent` 将 `event_name` 限制为（[types.ts:50-54](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/types.ts#L50)）：

| 事件名称 | 记录时机 |
|---|---|
| `provider.request.body` | 发送到上游的原始请求体 |
| `provider.response.body` | 从上游接收的原始响应体 |
| `upstream.stream.event.raw` | 来自上游的原始 SSE 数据块 |
| `upstream.stream.event.transformed` | 桥接层转换后的事件 |

## 负载捕获

`summarizePayload`（[payload.ts:10-35](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/payload.ts#L10)）控制存储多少数据：

| 模式 | `capturePayload` | `payload_json` | `payload_hash` |
|---|---|---|---|
| 仅摘要 | `false` | `null` | 完整 JSON 的 SHA-256 十六进制值 |
| 完整捕获 | `true` | 完整 JSON 字符串（不超过 `payloadMaxBytes`） | SHA-256 十六进制值 |
| 截断捕获 | `true` | 截断的 JSON 字符串 | SHA-256 十六进制值 |

`payload_bytes` 字段始终记录原始字节长度，无论是否截断（[payload.ts:23-24](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/payload.ts#L23)）。哈希使用 `Bun.CryptoHasher("sha256")` 计算（[payload.ts:6-8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/payload.ts#L6)）。

## 行映射

`mapTraceRecordToRow`（[row-mapper.ts:16-98](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/row-mapper.ts#L16)）根据 `event.kind` 分派：

| 类型 | 目标表 | 负载处理 |
|---|---|---|
| `request` | `trace_requests` | 通过 `summarizePayload` 摘要 |
| `usage` | `trace_usage` | 直接从 `TraceUsageSnapshot` 提取字段 |
| `event` | `trace_events` | 通过 `summarizePayload` 摘要 |
| `error` | `trace_errors` | 通过 `summarizePayload` 摘要 |

如果任何事件的序列化失败，映射器返回 `null` 并记录警告，而不是导致刷新崩溃（[row-mapper.ts:91-97](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/row-mapper.ts#L91)）。

## 记录辅助函数

四个辅助函数附加到 `TraceRecordingContext`，提供便捷的记录方式：

### recordTraceRequest

[request-recorder.ts:4-22](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/request-recorder.ts#L4) 记录提供商请求的开始，包括是否为流式请求、可选的 `prompt_cache_key`，以及可选的完整提供商请求体。

### recordTraceUsage

[usage-recorder.ts:6-22](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/usage-recorder.ts#L6) 通过 `traceUsageFromResponseUsage`（[usage.ts:4-23](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/usage.ts#L4)）将 `ResponseUsage` 转换为 `TraceUsageSnapshot`，同时在两者都可用时计算 `cache_hit_ratio` 为 `cached_tokens / input_tokens`。

### recordTraceEvent

[event-recorder.ts:5-25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/event-recorder.ts#L5) 记录一个命名事件，带有可选的负载和用于流内排序的序列号。

### recordTraceError

[error-recorder.ts:5-27](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/error-recorder.ts#L5) 从 `GodeXError` 或通用错误中提取错误元数据（类型、领域、错误码、消息、状态码），并以完整的错误上下文作为负载进行记录。

## 服务装配

`createTraceServices`（[trace-services.ts:15-34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/trace-services.ts#L15)）读取 `TraceConfig` 并创建由 `SQLiteTraceStore` 支持的 `AsyncTraceRecorder`（当 `config.enabled` 为 true 时）或 `NoopTraceRecorder`（当为 false 时）：

```mermaid
flowchart TD
    cfg["TraceConfig"] --> enabled{"enabled?"}
    enabled -->|Yes| sqlite["SQLiteTraceStore(config.path)"]
    sqlite --> async_rec["AsyncTraceRecorder"]
    async_rec --> result["{ traceEnabled: true, traceRecorder }"]
    enabled -->|No| noop["NoopTraceRecorder"]
    noop --> result2["{ traceEnabled: false, traceRecorder }"]

    style cfg fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style enabled fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style sqlite fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style async_rec fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style noop fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style result fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style result2 fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## 交叉引用

- [会话存储](../04-session-management/session-stores.md) -- 会话存储系统使用类似的 SQLite 持久化模式
- [ProviderSpec 契约](../03-provider-development/provider-spec.md) -- 追踪记录中的 provider 和 model 字段来自解析后的 spec

## 参考文献

- [src/trace/recorder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/recorder.ts) -- `TraceRecorder`、`AsyncTraceRecorder`、`NoopTraceRecorder`
- [src/trace/sqlite.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/sqlite.ts) -- `SQLiteTraceStore`、Schema 迁移
- [src/trace/types.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/types.ts) -- 所有追踪记录事件类型
- [src/trace/context.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/context.ts) -- `TraceRecordingContext`
- [src/trace/request-recorder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/request-recorder.ts) -- `recordTraceRequest`
- [src/trace/usage-recorder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/usage-recorder.ts) -- `recordTraceUsage`
- [src/trace/event-recorder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/event-recorder.ts) -- `recordTraceEvent`
- [src/trace/error-recorder.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/error-recorder.ts) -- `recordTraceError`
- [src/trace/row-mapper.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/row-mapper.ts) -- `mapTraceRecordToRow`
- [src/trace/payload.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/payload.ts) -- `summarizePayload`、`sha256Hex`
- [src/trace/usage.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/usage.ts) -- `traceUsageFromResponseUsage`
- [src/trace/time.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/trace/time.ts) -- `nowTraceMillis`
- [src/context/trace-services.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/context/trace-services.ts) -- `createTraceServices`

