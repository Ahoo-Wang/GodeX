---
title: "转换器"
description: "处理流式事件的可组合 TransformStream 阶段。"
keywords: "GodeX, 转换器, TraceTransformer, ResponseLogTransformer, SessionPersistence"
---

# 转换器

管道中的每个转换器是一个 `TransformStream`，逐个处理事件。它们使用 `pipeTransform()` 连接。

## TraceTransformer

将原始或转换后的流事件记录到追踪数据库。两个实例用于管道 — 一个用于原始上游事件，一个用于转换后的 Responses 事件。

## ProviderStreamEventBridge

将原始提供商 SSE 事件转换为 Responses API `ResponseStreamEvent` 对象。

- 对每个传入 SSE 块调用 `spec.stream.deltas()` 提取类型化增量
- 将增量送入状态机产生事件
- 在 `flush()` 中，如果状态机仍为 `IN_PROGRESS`，使用待定完成原因自动完成

## StreamErrorHandler

包装事件流以捕获错误并在流终止前发射 `response.failed` 事件。

## OutputContractValidation

在终止事件上验证结构化输出。如果输出合约要求 `json_schema` 但提供商降级为 `json_object`，此转换器验证最终输出是否为有效 JSON。

## ResponseLogTransformer

日志终止事件（completed、incomplete、failed），包含计时、使用量和缓存命中率。

## SessionPersistence

累积流状态并在流完成时持久化会话。当 `request.store === false` 时完全跳过。

## CompatibilityLog

在流结束时日志所有累积的兼容性诊断。

## ResponseSseEncoder

位于服务器路由中（不在管道内），将 `ResponseStreamEvent` 序列化为客户端期望的 SSE 线格式。

[流状态](/zh/05-streaming-pipeline/stream-state)
