---
title: "DeepSeek 参考实现"
description: "DeepSeek 提供商的实现演示 — 展示原生推理力度、缓存令牌使用量和内容数组处理。"
keywords: "GodeX, DeepSeek, provider 参考, 实现"
---

# DeepSeek 参考实现

DeepSeek 提供商是 GodeX 中内置的参考实现之一。它演示了原生推理力度支持、缓存令牌使用量报告和防御性内容数组文本提取。

## 模块结构

```
src/providers/deepseek/
├── spec.ts         # DEEPSEEK_PROVIDER_SPEC 声明（能力和访问器）
├── client.ts       # createDeepSeekProviderEdge() 工厂
├── hooks.ts        # 提供商特定 hooks（patchRequest、使用量映射、增量）
├── protocol/       # DeepSeek 特定类型定义
│   ├── completions.ts  # 请求/响应 DTO，包含 thinking 类型
│   └── index.ts        # 桶导出
└── index.ts        # 公共导出
```

## 能力

DeepSeek 提供商的关键能力特点：

- **原生推理力度**：DeepSeek 支持 `reasoning.effort: "native"`，bridge 将 Responses API 的 effort 值映射为 DeepSeek 原生 `reasoning_effort` 参数（`high` → `high`，`xhigh` → `max`）。
- **工具降级**：Codex 内置工具（`local_shell`、`shell`、`apply_patch`、`custom`、`tool_search`、`namespace`）降级为 `function` 类型。
- **最多 128 个工具**：DeepSeek 每个请求最多接受 128 个工具。
- **缓存令牌**：DeepSeek 报告 `prompt_cache_hit_tokens`，映射为 `input_tokens_details.cached_tokens`。

## Hooks

### `deepSeekPatchRequest`

将 bridge 的 Chat Completions 请求转换为 DeepSeek 特定格式：

1. 映射 `reasoning_effort` 值：`high` → `high`，`xhigh` → `max`。
2. 当推理激活或历史消息包含 `reasoning_content` 时，设置 `thinking: { type: "enabled" }`。
3. 当不需要推理时，设置 `thinking: { type: "disabled" }`。

### `deepSeekStreamDeltas`

从 DeepSeek SSE 块中提取类型化增量：

- `content` → 文本增量
- `reasoning_content` → 推理增量
- `tool_calls` → 工具调用增量
- `usage` → 使用量增量（含缓存令牌映射）
- `finish_reason` → 完成原因增量

## 客户端构建

`client.ts` 中的 `createDeepSeekProviderEdge()` 函数构建 `ProviderEdge`：

1. 使用提供商的 base URL、API key 和超时创建 `ChatProviderClient`。
2. 使用 bridge 内核的 `createProviderEdge()` 包装 spec、config 和 HTTP 方法。

## 注册

提供商在 `src/providers/builtin.ts` 中注册：

```ts
export const DEEPSEEK_PROVIDER_DEFINITION = createProviderDefinition(
  DEEPSEEK_PROVIDER_NAME,
  createDeepSeekProviderEdge,
);
```

默认 DeepSeek base URL 为 `https://api.deepseek.com`。默认模型为 `deepseek-v4-pro`。

## 内容处理

DeepSeek 可能将 `message.content` 作为字符串或内容部件数组返回。`deepSeekOutputText` 访问器处理两种情况，从数组内容中的 `type: "text"` 部件提取文本。

[智谱参考实现](/zh/03-provider-development/zhipu-reference)
