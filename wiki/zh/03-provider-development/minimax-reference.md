---
title: "MiniMax 参考实现"
description: "MiniMax 提供商详解 — 演示缓存 Token 用量、推理 Token、以及 max_completion_tokens 请求补丁。"
keywords: "GodeX, MiniMax, 提供商参考, 实现"
---

# MiniMax 参考实现

MiniMax 提供商是 GodeX 内置的参考实现之一。它演示了缓存 Token 和推理 Token 用量上报、`max_tokens` 到 `max_completion_tokens` 的请求补丁，以及防御性数组内容文本提取。

## 模块结构

```
src/providers/minimax/
├── spec.ts         # MINIMAX_PROVIDER_SPEC 声明（能力与访问器）
├── client.ts       # createMiniMaxProviderEdge() 工厂
├── hooks.ts        # 提供商特定 hooks（请求补丁、用量映射、增量）
├── protocol/       # MiniMax 特定类型定义
│   ├── completions.ts  # 请求/响应 DTO
│   └── index.ts        # 桶导出
└── index.ts        # 公共导出
```

## Spec 声明

`spec.ts` 中的 `MINIMAX_PROVIDER_SPEC` 声明了所有能力、访问器和 hooks：

```ts
export const MINIMAX_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest
> = {
  name: MINIMAX_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: MINIMAX_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_MINIMAX_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: minimaxFirstChoice,
    finishReason: minimaxFinishReason,
    outputText: minimaxOutputText,
    usage: minimaxResponseUsage,
  },
  stream: { deltas: minimaxStreamDeltas },
  hooks: { patchRequest: minimaxPatchRequest },
};
```

## 能力

```ts
const MINIMAX_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "user", "text.format",
    ]),
  },
  tools: {
    supported: new Set([
      "function", "local_shell", "shell", "apply_patch",
      "custom", "tool_search", "namespace",
    ]),
    degraded: new Map([
      ["local_shell", "function"],
      ["shell", "function"],
      ["apply_patch", "function"],
      ["custom", "function"],
      ["tool_search", "function"],
      ["namespace", "function"],
    ]),
    maxTools: 128,
  },
  toolChoice: { supported: new Set(["auto", "none", "required", "function"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "none" },
  streaming: { usage: true },
};
```

关键能力说明：

- **无推理努力**：MiniMax 使用 `reasoning.effort: "none"`，bridge 会从请求中移除 `reasoning_effort`。
- **工具降级**：Codex 内置工具（`local_shell`、`shell`、`apply_patch`、`custom`、`tool_search`、`namespace`）降级为 `function` 类型。
- **完整工具选择**：支持 `auto`、`none`、`required` 和 `function` 四种工具选择模式。
- **最多 128 个工具**：MiniMax 每次请求最多接受 128 个工具。
- **缓存 Token**：MiniMax 通过 `prompt_tokens_details.cached_tokens` 上报缓存 Token。
- **推理 Token**：MiniMax 通过 `completion_tokens_details.reasoning_tokens` 上报推理 Token。

## Hooks

### `minimaxPatchRequest`

将 bridge 的 Chat Completions 请求转换为 MiniMax 特定格式：

1. 移除 `reasoning_effort`（MiniMax 不支持）。
2. 将 `max_tokens` 映射为 `max_completion_tokens`（MiniMax 使用 `max_completion_tokens` 参数名）。

### `minimaxStreamDeltas`

从 MiniMax SSE 块中提取类型化增量：

- `content` → 文本增量
- `tool_calls` → 工具调用增量（通过共享的 `mapCommonChatStreamDelta`）
- `usage` → 用量增量（含缓存 Token 和推理 Token 映射）
- `finish_reason` → 完成原因增量

### `mapMiniMaxUsage`

将 MiniMax 用量格式映射为标准 `ResponseUsage` 类型，包括：

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`
- `completion_tokens_details.reasoning_tokens` → `output_tokens_details.reasoning_tokens`

两个字段都通过 `assertFiniteNumber` 校验，格式错误时抛出 `ProviderError`。

## 客户端构建

`client.ts` 中的 `createMiniMaxProviderEdge()` 函数构建 `ProviderEdge`：

1. 使用提供商的 base URL、API Key 和超时创建 `ChatProviderClient`。
2. 使用 bridge 内核的 `createProviderEdge()` 包装 spec、配置和 HTTP 方法。

## 注册

提供商在 `src/providers/builtin.ts` 中注册：

```ts
export const MINIMAX_PROVIDER_DEFINITION = createProviderDefinition(
  MINIMAX_PROVIDER_NAME,
  createMiniMaxProviderEdge,
);
```

默认 MiniMax base URL 为 `https://api.minimaxi.com/v1`。默认模型为 `MiniMax-M2.7`。

## 内容处理

MiniMax 可能将 `message.content` 作为字符串或内容数组返回。`minimaxOutputText` 访问器同时处理两种情况，从数组内容中提取 `type: "text"` 部分的文本。当 `content` 为 `null` 或无法识别的类型时，返回空字符串。

## 模型

| 模型 ID | 说明 |
|---------|------|
| `MiniMax-M2.7` | 默认模型 |
| `MiniMax-M2.7-highspeed` | 高速变体 |
| `MiniMax-M2.5` | 上一代模型 |
| `MiniMax-M2.1` | 更早代模型 |

[智谱参考](/zh/03-provider-development/zhipu-reference)
[DeepSeek 参考](/zh/03-provider-development/deepseek-reference)
