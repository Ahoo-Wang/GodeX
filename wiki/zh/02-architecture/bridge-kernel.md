---
title: "Bridge 内核"
description: "Bridge 层如何在 Responses API 和提供商 Chat Completions 之间进行翻译，不包含提供商特定逻辑。"
keywords: "GodeX, bridge 内核, 兼容性, 工具, 输出合约, 请求构建"
---

# Bridge 内核

Bridge 内核（`src/bridge/`）是核心翻译引擎。它位于 Responses 编排层和提供商实现之间，以与提供商无关的方式在 OpenAI Responses API 协议和 Chat Completions 格式之间转换。

## 子模块职责

| 子模块 | 职责 |
|--------|------|
| `compatibility/` | 规划支持、降级、忽略和拒绝的请求特性 |
| `request/` | 将 Responses 输入和会话历史规范化为 Chat Completions 消息 |
| `tools/` | 规划工具声明、`tool_choice`、降级、身份映射和调用恢复 |
| `output/` | 规划结构化输出合约并验证严格降级的 JSON 输出 |
| `response/` | 从提供商响应重建同步 `ResponseObject` |
| `stream/` | 通过状态机将提供商增量映射为 Responses SSE 事件 |
| `provider-spec/` | 定义 `ProviderSpec`、`ProviderEdge`、提供商常量和包形状检查 |
| `finish-reason/` | 将提供商完成原因映射为 Responses 终止状态 |

## 请求构建

`bridge/request/` 中的 `buildChatCompletionRequest()` 函数是主入口。它组合四个规划步骤：

1. **兼容性规划** — `planBridgeCompatibility()` 根据提供商能力检查每个请求参数，记录支持、降级、忽略或拒绝决策。
2. **工具规划** — `planTools()` 将工具定义映射为提供商工具声明，处理工具类型降级（如 `local_shell` 降级为 `function`），并计算有效的 `tool_choice`。
3. **输出合约规划** — `planOutputContract()` 决定结构化输出的处理方式，包括在提供商不支持原生 schema 时将 `json_schema` 降级为 `json_object`。
4. **消息构建** — 将当前输入和会话历史规范化为 Chat Completions 消息，注入降级输出格式的合成前言指令。

## 兼容性规划

每个参数都会根据提供商能力集进行检查，产生一个 `CompatibilityDecision`：

| 动作 | 含义 |
|------|------|
| `supported` | 参数原样转发 |
| `degraded` | 参数转换为低保真等效 |
| `ignored` | 参数由 GodeX 消费，不转发 |
| `rejected` | 不支持参数；请求以 `BridgeError` 失败 |

诊断信息累积在 `ResponsesContext.diagnostics` 中，并在响应完成后记录。

## ProviderEdge

`ProviderEdge` 接口是 bridge 与提供商的契约。每个提供商实现一个 `ProviderSpec`，声明能力、读取响应和流块的访问器，以及可选的请求补丁 hooks。

提供商特定差异属于每个提供商的 `spec.ts`、`hooks.ts`、协议类型和 HTTP 客户端。Bridge 内核本身从不包含提供商特定逻辑。

[流式管道](/zh/02-architecture/stream-pipeline)
