---
title: "Xiaomi 参考实现"
description: "Xiaomi 提供商详解 — 演示布尔推理 Effort、thinking 保留以及 max_completion_tokens 请求补丁。"
keywords: "GodeX, Xiaomi, MiMo, 提供商参考, 实现"
---

# Xiaomi 参考实现

Xiaomi 提供商集成了小米 MiMo API（`api.xiaomimimo.com/v1`），这是一个 OpenAI 兼容的 Chat Completions API，支持原生 thinking/推理功能。它演示了布尔推理 Effort 映射、多轮推理内容保留、以及 `max_tokens` 到 `max_completion_tokens` 的请求补丁。

## 模块结构

```
src/providers/xiaomi/
├── spec.ts         # XIAOMI_PROVIDER_SPEC 声明（能力与访问器）
├── client.ts       # createXiaomiProviderEdge() 工厂
├── hooks.ts        # 提供商特定 hooks（请求补丁、用量映射、增量）
├── protocol/       # Xiaomi 特定类型定义
│   ├── completions.ts  # 请求/响应 DTO
│   └── index.ts        # 桶导出
└── index.ts        # 公共导出
```

## Spec 声明

`spec.ts` 中的 `XIAOMI_PROVIDER_SPEC` 声明了所有能力、访问器和 hooks：

```ts
export const XIAOMI_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest
> = {
  name: XIAOMI_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: XIAOMI_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_XIAOMI_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: xiaomiFirstChoice,
    finishReason: xiaomiFinishReason,
    outputText: xiaomiOutputText,
    usage: xiaomiResponseUsage,
  },
  stream: { deltas: xiaomiStreamDeltas },
  hooks: { patchRequest: xiaomiPatchRequest },
};
```

## 能力

```ts
const XIAOMI_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "user", "reasoning", "text.format",
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
  toolChoice: { supported: new Set(["auto"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "boolean" },
  streaming: { usage: true },
};
```

关键能力说明：

- **布尔推理**：Xiaomi 使用 `reasoning.effort: "boolean"`，bridge 将 reasoning effort 映射为 `thinking: { type: "enabled"/"disabled" }`。
- **工具选择受限**：仅支持 `auto` 工具选择模式。
- **工具降级**：Codex 内置工具降级为 `function` 类型。
- **最多 128 个工具**：Xiaomi 每次请求最多接受 128 个工具。
- **缓存 Token**：Xiaomi 通过 `prompt_tokens_details.cached_tokens` 上报缓存 Token。
- **推理 Token**：Xiaomi 通过 `completion_tokens_details.reasoning_tokens` 上报推理 Token。

## Hooks

### `xiaomiPatchRequest`

将 bridge 的 Chat Completions 请求转换为 Xiaomi 特定格式，按三个优先级处理：

1. **历史推理内容** — 当消息历史中存在 `reasoning_content` 时，强制 `thinking: { type: "enabled" }` 以保持多轮推理连续性。
2. **Bridge 已设置的 thinking** — 当 bridge 通过布尔 Effort 映射已设置 `thinking` 时，保留不变。
3. **默认禁用** — 未请求推理且无 thinking 字段时，设置 `thinking: { type: "disabled" }`。

此外，移除 `reasoning_effort`（Xiaomi 不支持）并将 `max_tokens` 映射为 `max_completion_tokens`。

### `xiaomiStreamDeltas`

从 Xiaomi SSE 块中提取类型化增量：

- `content` → 文本增量
- `tool_calls` → 工具调用增量（通过共享的 `mapCommonChatStreamDelta`）
- `usage` → 用量增量（含缓存 Token 和推理 Token 映射）
- `finish_reason` → 完成原因增量

### `mapXiaomiUsage`

将 Xiaomi 用量格式映射为标准 `ResponseUsage` 类型，包括：

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`
- `completion_tokens_details.reasoning_tokens` → `output_tokens_details.reasoning_tokens`

两个字段都通过 `assertFiniteNumber` 校验，格式错误时抛出 `ProviderError`。

## 客户端构建

`client.ts` 中的 `createXiaomiProviderEdge()` 函数构建 `ProviderEdge`：

1. 使用提供商的 base URL、API Key 和超时创建 `ChatProviderClient`。
2. 使用 bridge 内核的 `createProviderEdge()` 包装 spec、配置和 HTTP 方法。

## 注册

提供商在 `src/providers/builtin.ts` 中注册：

```ts
export const XIAOMI_PROVIDER_DEFINITION = createProviderDefinition(
  XIAOMI_PROVIDER_NAME,
  createXiaomiProviderEdge,
);
```

默认 Xiaomi base URL 为 `https://api.xiaomimimo.com/v1`。默认模型为 `mimo-v2.5-pro`。API Key 通过 `MIMO_API_KEY` 环境变量配置。

## 内容处理

Xiaomi 可能将 `message.content` 作为字符串或内容数组返回。`xiaomiOutputText` 访问器同时处理两种情况，从数组内容中提取 `type: "text"` 部分的文本。当 `content` 为 `null` 或无法识别的类型时，返回空字符串。

## 模型

| 模型 ID | 说明 |
|---------|------|
| `mimo-v2.5-pro` | 默认模型，能力最强 |
| `mimo-v2.5` | 高质量模型 |
| `mimo-v2.5-tts` | 语音合成模型 |
| `mimo-v2-pro` | 上一代 Pro 模型 |
| `mimo-v2-omni` | 上一代多模态模型 |
| `mimo-v2-flash` | 快速推理模型 |

[MiniMax 参考](/zh/03-provider-development/minimax-reference)
[智谱参考](/zh/03-provider-development/zhipu-reference)
[DeepSeek 参考](/zh/03-provider-development/deepseek-reference)
