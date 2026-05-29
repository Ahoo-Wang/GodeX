---
title: "智谱参考实现"
description: "智谱提供商的实现演示 — 展示所有 provider 接口的参考实现。"
keywords: "GodeX, 智谱, Zhipu, provider 参考, 实现"
---

# 智谱参考实现

智谱（Zhipu）提供商是 GodeX 中内置的参考实现之一。它演示了如何使用 `ProviderSpec`、`ProviderHooks` 和 `ChatProviderClient` 构建完整的提供商。

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

## 客户端构建

`client.ts` 中的 `createZhipuProviderEdge()` 函数构建 `ProviderEdge`：

1. 使用提供商的 base URL、API key 和超时创建 `ChatProviderClient`。
2. 使用 bridge 内核的 `createProviderEdge()` 包装 spec、config 和 HTTP 方法。

## Hooks

`hooks.ts` 文件包含提供商特定行为：

- **`zhipuPatchRequest`** — 当需要时将 bridge 的 Chat Completions 请求转换为智谱原生格式。
- **`zhipuStreamDeltas`** — 从智谱 SSE 块中提取类型化增量。
- **`mapZhipuUsage`** — 将智谱使用量格式映射为标准 `ResponseUsage` 类型。

## 注册

提供商在 `src/providers/builtin.ts` 中注册：

```ts
export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
  ZHIPU_PROVIDER_NAME,
  createZhipuProviderEdge,
);
```

默认智谱 base URL 为 `https://open.bigmodel.cn/api/coding/paas/v4`。默认模型为 `glm-5.1`。

[消息与工具映射](/zh/03-provider-development/message-tool-mapping)
[DeepSeek 参考](/zh/03-provider-development/deepseek-reference)
