---
title: "流状态"
description: "StreamState 如何在流式传输期间累积部分结果。"
keywords: "GodeX, 流状态, StreamState"
---

# 流状态

`StreamState` 对象是 `ResponseSessionPersistenceTransformer` 使用的可变累积器，用于在流事件到达时收集部分结果。

## 状态结构

```mermaid
classDiagram
  direction TB

  class StreamState {
    +phase: StreamPhase
    +outputText: string
    +reasoningContent: string
    +toolCalls: ToolCallAccumulator[]
    +completedAt: number or null
    +finalStatus: StatusFields
  }
```

## 累积流程

当每个 `ResponseStreamEvent` 流经转换器时：

1. **内容增量事件**：追加文本到 `outputText` 并跟踪当前内容项
2. **工具调用事件**：在 `toolCalls` 中累积函数调用参数
3. **推理事件**：追加思考内容到 `reasoningContent`
4. **终止事件**：设置 `completedAt`、`finalStatus` 并触发会话保存

当终止事件到达时，`StreamMapper.buildResponseObject(ctx, state)` 从累积状态构建完整的 `ResponseObject`。

[错误层次](/zh/06-error-handling/error-hierarchy)
