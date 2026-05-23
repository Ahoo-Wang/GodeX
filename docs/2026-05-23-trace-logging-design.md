# Trace 级别日志设计

## 目标

在适配器层添加 trace 级别日志，记录完整的请求/响应体，用于生产问题排查、开发调试和可观测性审计。

## 约束

- 无额外配置项，`logging.level: trace` 时自动记录完整内容
- 使用现有结构化日志格式，与 debug/info/warn/error 风格一致
- Logger 接口和 LogTape 映射已支持 trace，无需改动基础设施

## 日志事件

| 事件名 | 位置 | 记录内容 |
|--------|------|----------|
| `responses.request.body` | `DefaultAdapter` | 完整 Responses API 请求体 |
| `upstream.request.body` | `DefaultAdapter` | 映射后的上游请求体 |
| `upstream.response.body` | `DefaultAdapter` | 上游完整响应（仅非流式） |
| `upstream.stream.event.raw` | `TraceTransformer` | 上游 SSE 原始事件 |
| `upstream.stream.event.transformed` | `TraceTransformer` | 转换后的 ResponseStreamEvent |

## 方案：直接在 DefaultAdapter 和独立 TraceTransformer 中添加 trace 调用

### 非流式场景

在 `DefaultAdapter.request()` 中添加 3 条 trace：

```
入口 → trace("responses.request.body", { body: ctx.request })
     → mapper.request.map(ctx)
     → trace("upstream.request.body", { body: req })
     → chatClient.chat(req)
     → trace("upstream.response.body", { body: res })
```

### 流式场景

在 `DefaultAdapter.stream()` 中添加 2 条 trace + 新增 `TraceTransformer`：

**adapter 层：**
```
入口 → trace("responses.request.body", { body: ctx.request })
     → mapper.request.map(ctx)
     → trace("upstream.request.body", { body: req })
     → chatClient.streamChat(req)
     → 流管道处理...
```

**流管道（调整后）：**
```
上游 SSE 流
  → ProviderEventToResponseTransformer   // 事件转换
  → TraceTransformer                      // trace 日志（新增）
  → ResponseLogTransformer                // 现有 debug/info 日志
  → ResponseSessionPersistenceTransformer // 会话持久化
```

`TraceTransformer` 记录：
- 每个转换前事件：`trace("upstream.stream.event.raw", { event })`
- 每个转换后事件：`trace("upstream.stream.event.transformed", { event })`

## 涉及文件

| 文件 | 改动 |
|------|------|
| `src/adapter/default-adapter.ts` | 新增 5 条 trace 调用（非流式 3 条 + 流式 2 条） |
| `src/adapter/transformers/trace-transformer.ts` | 新建，流管道 trace transformer |
| 测试文件 | 为新增 trace 调用补充测试 |

无配置文件改动，无接口变更。
