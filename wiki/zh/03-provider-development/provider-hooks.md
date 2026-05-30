---
title: Provider Hooks
description: ProviderHooks let each upstream provider patch requests, normalize responses, and transform streaming chunks so the bridge runtime can treat every provider uniformly while preserving provider-specific behaviour.
---

# Provider Hooks

GodeX 的桥接运行时使用一种内部协议，但每个上游提供商都有自己的特点——DeepSeek 使用原生的 `reasoning_effort` 参数和 `thinking` 对象，Zhipu 支持 `web_search` 和 `file_search` 工具类型，MiniMax 将 `max_tokens` 重映射为 `max_completion_tokens`。`ProviderHooks` 是每个提供商注入自己规范化逻辑的扩展点。通过保持钩子可选并与提供商规范同目录放置，GodeX 避免了庞大的适配器层，让每个提供商拥有自己的转换逻辑。

钩子接口定义了三个可选方法（[contract.ts:43-52](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts#L43)）：`patchRequest`、`normalizeResponse` 和 `normalizeChunk`。这些方法在 `createProviderEdge` 内部的桥接运行时和上游 HTTP 调用之间的边界处被调用。

## 概览

| 钩子 | 签名 | 调用时机 | 用途 |
|---|---|---|---|
| `patchRequest` | `(bridgeReq) => providerReq` | 每次 HTTP 调用之前 | 将桥接格式的请求转换为提供商格式的请求 |
| `normalizeResponse` | `(response) => response` | 非流式响应之后 | 在桥接层读取之前修正提供商响应 |
| `normalizeChunk` | `(chunk) => chunk` | 流式模式下的每个 SSE 块 | 在桥接层读取之前修正提供商块 |

## 钩子调用流程

```mermaid
sequenceDiagram
    autonumber
    participant Bridge as Bridge Runtime
    participant Edge as ProviderEdge
    participant Hooks as ProviderHooks
    participant HTTP as Upstream API

    Bridge->>Edge: request(bridgeBody)
    Edge->>Hooks: patchRequest(bridgeBody)
    Note right of Hooks: Provider-specific transforms
    Hooks-->>Edge: providerBody
    Edge->>HTTP: POST /chat/completions
    HTTP-->>Edge: response
    Edge->>Hooks: normalizeResponse(response)
    Hooks-->>Edge: normalizedResponse
    Edge-->>Bridge: normalizedResponse

    Bridge->>Edge: stream(bridgeBody)
    Edge->>Hooks: patchRequest(bridgeBody)
    Hooks-->>Edge: providerBody
    Edge->>HTTP: POST /chat/completions (stream)
    HTTP-->>Edge: SSE chunks
    loop Each chunk
        Edge->>Hooks: normalizeChunk(chunk)
        Hooks-->>Edge: normalizedChunk
    end
    Edge-->>Bridge: ReadableStream of normalized chunks

    style Bridge fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Edge fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Hooks fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style HTTP fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## DeepSeek 钩子

[hooks.ts:113-136](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts#L113) 中的 DeepSeek 提供商钩子处理推理力度映射和思考模式激活：

| 场景 | 补丁行为 |
|---|---|
| `reasoning_effort` 为 `"high"` 或 `"xhigh"` | 设置 `thinking: { type: "enabled" }` 并将力度映射为原生值（`"high"` -> `"high"`、`"xhigh"` -> `"max"`） |
| 消息包含历史 `reasoning_content` | 设置 `thinking: { type: "enabled" }` 以保持连续性 |
| 默认（无推理） | 显式设置 `thinking: { type: "disabled" }` |

`deepSeekStreamDeltas` 函数（[hooks.ts:149-164](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts#L149)）通过提取使用情况数据、内容文本、工具调用、推理内容和结束原因，将每个 SSE 块映射为 `ProviderStreamDelta` 数组。

```mermaid
flowchart TD
    req["Incoming Bridge Request"] --> effort{"Has reasoning_effort?"}
    effort -->|"high" / "xhigh"| native["Add thinking.enabled<br>Map effort to native value"]
    effort -->|No| history{"Messages have<br>reasoning_content?"}
    history -->|Yes| think_on["Add thinking.enabled"]
    history -->|No| think_off["Add thinking.disabled"]
    native --> out["Provider Request"]
    think_on --> out
    think_off --> out

    style req fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style effort fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style history fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style native fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style think_on fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style think_off fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style out fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Zhipu 钩子

Zhipu 的 `zhipuPatchRequest`（[hooks.ts:113-134](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/hooks.ts#L113)）遵循类似的模式，但具有 Zhipu 特有的差异：

| 场景 | 补丁行为 |
|---|---|
| 请求已设置 `thinking` | 保留但强制 `clear_thinking: false` |
| 消息包含历史 `reasoning_content` | 注入 `thinking: { type: "enabled", clear_thinking: false }` |
| 默认 | 剥离 `reasoning_effort` 并直接传递 |

Zhipu 还支持更广泛的工具类型（[hooks.ts:16-30](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/hooks.ts#L16)），包括 `web_search`、`file_search`、`mcp` 和 `shell`，并有一个降级映射将提供商特定的工具类型转换为标准 Chat Completions 等效项：

| 上游类型 | 降级为 |
|---|---|
| `web_search_2025_08_26` | `web_search` |
| `web_search_preview` | `web_search` |
| `file_search` | `retrieval` |
| `local_shell` / `shell` | `function` |
| `custom` / `tool_search` / `namespace` | `function` |

## MiniMax 钩子

MiniMax 的 `minimaxPatchRequest`（[hooks.ts:112-121](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/minimax/hooks.ts#L112)）更简单：

1. 剥离 `reasoning_effort`（MiniMax 不支持推理参数）。
2. 当存在 `max_tokens` 时将其重映射为 `max_completion_tokens`。

```mermaid
flowchart LR
    req["Bridge Request"] --> strip["Strip reasoning_effort"]
    strip --> mt{"Has max_tokens?"}
    mt -->|Yes| remap["max_tokens -> max_completion_tokens"]
    mt -->|No| pass["Pass through"]
    remap --> out["MiniMax Request"]
    pass --> out

    style req fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style strip fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style mt fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style remap fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style pass fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style out fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## 共享流增量映射器

所有三个内置提供商都将工具调用和推理内容提取委托给 [stream-delta-mapper.ts:18-42](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/stream-delta-mapper.ts#L18) 中的 `mapCommonChatStreamDelta`。此共享工具处理：

| 增量字段 | 映射 |
|---|---|
| `reasoning_content` | `{ reasoning: content }` 增量 |
| `tool_calls[i].id` | 复制到 `toolCall.id` |
| `tool_calls[i].function.name` | 复制到 `toolCall.name` |
| `tool_calls[i].function.arguments` | 复制到 `toolCall.arguments` |
| `tool_calls[i].index` | 复制到 `toolCall.index` |
| `tool_calls[i].type` | 复制到 `toolCall.type` |

每个提供商的流增量函数在提取提供商特定的内容增量后调用 `mapCommonChatStreamDelta`。例如，DeepSeek 的 `mapDeepSeekChoiceDelta`（[hooks.ts:166-175](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts#L166)）为 `delta.content` 推入一个 `{ text }` 增量，然后在上面展开通用增量。

## 自定义工具降级

[custom-tool-degradation.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/custom-tool-degradation.ts) 提供辅助函数，当提供商不原生支持 Responses API 自定义工具时，将其转换为 Chat Completions 函数工具：

- `degradedCustomToolDescription`（[custom-tool-degradation.ts:14-20](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/custom-tool-degradation.ts#L14)）附加说明工具已被降级的备注并描述输入格式。
- `degradedCustomToolParameters`（[custom-tool-degradation.ts:24-38](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/custom-tool-degradation.ts#L24)）生成包含单个必需 `input` 字符串参数的 schema。

## 输入兼容性

[input-compatibility.ts:9-34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/input-compatibility.ts#L9) 中的 `warnUnsupportedCurrentInputContent` 在 Responses 请求包含 Chat Completions 无法表示的内容类型（`input_text` / `output_text` 以外的任何内容）时发出诊断信息。这在桥接过程中被调用，让用户了解被静默忽略的字段。

## 请求守卫

`assertProviderChatRequest`（[chat-request-guard.ts:5-27](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/chat-request-guard.ts#L5)）验证修补后的请求具有 `model` 字符串和 `messages` 数组，然后再发送到上游提供商。每个 `patchRequest` 钩子将此守卫作为其第一步调用。

## 能力比较

| 能力 | DeepSeek | Zhipu | MiniMax |
|---|---|---|---|
| 推理力度 | `native`（high/max） | `boolean`（enabled/disabled） | `none` |
| 最大工具数 | 128 | 128 | 128 |
| 工具选择模式 | auto、none、required、function | auto、none | auto、none、required、function |
| 响应格式 | text、json_object | text、json_object | text、json_object |
| 流式 usage | 是 | 是 | 是 |
| 网页搜索工具 | 否 | 是 | 否 |

## 交叉引用

- [ProviderSpec Contract](./provider-spec.md)——声明钩子的规范接口
- [Chat Provider Client](./chat-provider-client.md)——调用 `patchRequest` 和 `normalizeResponse` 的 HTTP 传输层

## 参考文献

- [src/providers/deepseek/hooks.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts)——DeepSeek patchRequest、streamDeltas、usage 映射
- [src/providers/zhipu/hooks.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/hooks.ts)——Zhipu patchRequest、web_search 降级、streamDeltas
- [src/providers/minimax/hooks.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/minimax/hooks.ts)——MiniMax patchRequest、max_tokens 重映射
- [src/providers/shared/stream-delta-mapper.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/stream-delta-mapper.ts)——`mapCommonChatStreamDelta`
- [src/providers/shared/custom-tool-degradation.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/custom-tool-degradation.ts)——自定义工具到函数工具的降级
- [src/providers/shared/input-compatibility.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/input-compatibility.ts)——不支持的内容类型警告
- [src/providers/shared/chat-request-guard.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/shared/chat-request-guard.ts)——`assertProviderChatRequest`
- [src/bridge/provider-spec/contract.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts)——`ProviderHooks` 接口定义
