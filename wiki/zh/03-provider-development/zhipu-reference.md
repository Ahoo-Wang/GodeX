---
title: "智谱参考实现"
description: "智谱提供商的实现演示 — 展示所有 provider 接口的参考实现。"
keywords: "GodeX, 智谱, Zhipu, provider 参考, 实现"
---

# 智谱参考实现

智谱（Zhipu）提供商是 GodeX 中内置的参考实现之一。它演示了如何使用 `ProviderSpec`、`ProviderHooks` 和 `ChatProviderClient` 构建完整的提供商，包括网络搜索、文件搜索和 MCP 工具支持。

## 模块结构

```
src/providers/zhipu/
├── spec.ts         # ZHIPU_PROVIDER_SPEC 声明（能力和访问器）
├── client.ts       # createZhipuProviderEdge() 工厂
├── hooks.ts        # 提供商特定 hooks（patchRequest、使用量映射、增量）
├── protocol/       # 智谱特定类型定义
│   ├── completions.ts  # 请求/响应 DTO
│   ├── models.ts       # 模型列表类型
│   └── index.ts        # 桶导出
└── index.ts        # 公共导出
```

## Spec 声明

`spec.ts` 中的 `ZHIPU_PROVIDER_SPEC` 声明所有能力、访问器和 hooks：

```ts
export const ZHIPU_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionCreateRequest
> = {
  name: ZHIPU_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: ZHIPU_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_ZHIPU_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: zhipuFirstChoice,
    finishReason: zhipuFinishReason,
    outputText: zhipuOutputText,
    usage: zhipuResponseUsage,
  },
  stream: { deltas: zhipuStreamDeltas },
  hooks: { patchRequest: zhipuPatchRequest },
};
```

## 能力声明

```ts
const ZHIPU_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "safety_identifier", "user", "reasoning", "text.format",
    ]),
  },
  tools: {
    supported: new Set([
      "function", "web_search", "web_search_2025_08_26",
      "web_search_preview", "web_search_preview_2025_03_11",
      "file_search", "mcp",
      "local_shell", "shell", "apply_patch",
      "custom", "tool_search", "namespace",
    ]),
    degraded: new Map([
      ["web_search_2025_08_26", "web_search"],
      ["web_search_preview", "web_search"],
      ["web_search_preview_2025_03_11", "web_search"],
      ["file_search", "retrieval"],
      ["local_shell", "function"],
      ["shell", "function"],
      ["apply_patch", "function"],
      ["custom", "function"],
      ["tool_search", "function"],
      ["namespace", "function"],
    ]),
    maxTools: 128,
  },
  toolChoice: { supported: new Set(["auto", "none"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "boolean" },
  streaming: { usage: true },
};
```

关键能力说明：

- **布尔推理努力**：智谱使用 `reasoning.effort: "boolean"`，表示 bridge 将推理映射为开/关布尔切换，而非多级努力值。
- **丰富的工具支持**：智谱支持 `web_search`（含版本化变体）、`file_search`（降级为 `retrieval`）、`mcp` 以及所有标准 Codex 内置工具。
- **有限的工具选择**：仅支持 `auto` 和 `none`，不支持 `required` 和 `function` 模式。
- **最多 128 个工具**：智谱每个请求最多接受 128 个工具。
- **缓存令牌**：智谱通过 `prompt_tokens_details.cached_tokens` 报告缓存令牌。

## Hooks

### `zhipuPatchRequest`

将 bridge 的 Chat Completions 请求转换为智谱特定格式：

1. 如果存在 `reasoning_effort`，则从请求中移除（智谱使用布尔推理）。
2. 如果已配置 `thinking`，则合并 `clear_thinking: false` 以保留推理上下文。
3. 如果历史消息包含 `reasoning_content`，则启用 thinking 并设置 `clear_thinking: false`。
4. 否则，直接传递请求。

### `zhipuStreamDeltas`

从智谱 SSE 块中提取类型化增量：

- `content` → 文本增量
- `tool_calls` → 工具调用增量（通过共享的 `mapCommonChatStreamDelta`）
- `usage` → 使用量增量（含缓存令牌映射）
- `finish_reason` → 结束原因增量

### `mapZhipuUsage`

将智谱使用量格式映射为标准 `ResponseUsage` 类型，包括：

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`

## 客户端构建

`client.ts` 中的 `createZhipuProviderEdge()` 函数构建 `ProviderEdge`：

1. 使用提供商的 base URL、API key 和超时创建 `ChatProviderClient`。
2. 使用 bridge 内核的 `createProviderEdge()` 包装 spec、config 和 HTTP 方法。

## 注册

提供商在 `src/providers/builtin.ts` 中注册：

```ts
export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
  ZHIPU_PROVIDER_NAME,
  createZhipuProviderEdge,
);
```

## Base URL

智谱有两个 base URL：

| URL | 用途 |
|-----|------|
| `https://open.bigmodel.cn/api/paas/v4` | 标准 API 端点 |
| `https://open.bigmodel.cn/api/coding/paas/v4` | 编程套餐端点（默认） |

默认 base URL 为编程套餐端点。默认模型为 `glm-5.1`。

[消息与工具映射](/zh/03-provider-development/message-tool-mapping)
[DeepSeek 参考](/zh/03-provider-development/deepseek-reference)
[MiniMax 参考](/zh/03-provider-development/minimax-reference)
