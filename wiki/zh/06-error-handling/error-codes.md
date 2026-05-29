---
title: "错误码"
description: "GodeX 中使用的域特定错误码完整参考。"
keywords: "GodeX, 错误码, 域代码, 诊断"
---

# 错误码

## Bridge 域

| 代码 | 描述 |
|------|------|
| `bridge.request.unsupported_parameter` | 请求包含提供商不支持的参数 |
| `bridge.request.tool_skipped` | 工具因不支持而被跳过 |
| `bridge.request.unsupported_input_item` | 提供商不支持的输入项类型 |
| `bridge.request.unsupported_input_content` | 不支持的输入内容类型 |
| `bridge.request.unsupported_tool` | 工具类型不在提供商的支持或降级集合中 |
| `bridge.response.invalid_output_format` | 结构化输出验证失败 |

## Bridge Stream 域

| 代码 | 描述 |
|------|------|
| `bridge.stream.not_initialized` | 流状态机在创建前被访问 |
| `bridge.stream.already_initialized` | 流状态机被创建两次 |
| `bridge.stream.invalid_transition` | 从意外阶段调用方法 |
| `bridge.stream.output_before_start` | `start()` 之前收到增量 |
| `bridge.stream.delta_after_terminal` | 流达到终止阶段后收到增量 |
| `bridge.stream.missing_options` | 未提供所需的流选项 |
| `bridge.stream.missing_output_block` | 未找到预期的输出块 |
| `bridge.stream.incomplete_tool_call` | 流以未完成的工具调用结束 |

## Provider 域

| 代码 | 描述 |
|------|------|
| `provider.upstream.rate_limit` | 上游 API 速率限制 |
| `provider.upstream.timeout` | 上游 API 请求超时 |
| `provider.upstream.server_error` | 上游返回 5xx 错误 |
| `provider.upstream.error` | 通用上游通信失败 |

## Session 域

| 代码 | 描述 |
|------|------|
| `session.chain.not_found` | 引用的响应 ID 不存在 |
| `session.chain.cycle_detected` | 链遍历发现循环 |
| `session.chain.depth_exceeded` | 链深度超限（默认：64） |
| `session.chain.unavailable` | 引用的响应未完成 |
| `session.store.conflict` | 重复保存或父指针不匹配 |

## Server 域

| 代码 | 描述 |
|------|------|
| `server.request.invalid_json` | 请求体不是有效 JSON |
| `server.request.missing_model` | 缺少必需的 `model` 字段 |
| `server.request.invalid_parameter` | 参数验证失败 |
| `server.provider.not_registered` | 提供商没有注册的工厂 |
| `server_error` | 通用服务器错误 |

[配置](/zh/07-configuration/config-schema)
