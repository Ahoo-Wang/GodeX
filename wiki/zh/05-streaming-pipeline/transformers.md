---
title: "转换器"
description: "处理流式事件的三阶段 TransformStream。"
keywords: "GodeX, 转换器, 流式管道"
---

# 转换器

管道中的每个转换器都是一个 `TransformStream`，逐个处理事件。它们通过 `pipeTransform()` 连接（`ReadableStream.pipeThrough()` 的薄封装）。

## ProviderEventToResponseTransformer

将原始提供商 SSE 事件转换为 Responses API `ResponseStreamEvent` 对象。

- 每个传入 SSE 数据块调用 `StreamMapper.map()`
- 每个数据块可能产生零个、一个或多个 `ResponseStreamEvent`
- 处理提供商特定的事件类型映射

## ResponseSessionPersistenceTransformer

累积流状态并在流完成时持久化会话。

- 当 `request.store === false` 时完全跳过
- 在终止事件上调用 `StreamMapper.buildResponseObject()` 然后保存

## ResponseSseEncodeTransformer

将 `ResponseStreamEvent` 序列化为客户端期望的 SSE 线格式。

```
event: response.output_item.added
data: {"type":"response.output_item.added","output_index":0,"item":{...}}

```

[流状态](/zh/05-streaming-pipeline/stream-state)
