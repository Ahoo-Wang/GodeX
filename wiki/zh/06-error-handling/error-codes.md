---
title: "错误码"
description: "GodeX 中使用的所有域特定错误码完整参考。"
---

# 错误码

## Adapter 域

| 代码 | 说明 |
|------|------|
| `adapter.request.unsupported_parameter` | 请求包含提供商不支持的参数 |
| `adapter.request.tool_skipped` | 工具因不被支持而被跳过 |
| `adapter.request.unsupported_input_item` | 输入项类型不被提供商支持 |
| `adapter.request.unsupported_input_content` | 输入内容类型不被支持 |
| `adapter.request.unsupported_tool` | 工具类型不在提供商的 `supportedToolTypes` 中 |

## Provider 域

| 代码 | 说明 |
|------|------|
| `provider.upstream.rate_limit` | 上游 API 速率限制超出 |
| `provider.upstream.timeout` | 上游 API 请求超时 |
| `provider.upstream.server_error` | 上游返回 5xx 错误 |
| `provider.upstream.error` | 通用上游通信失败 |

## Session 域

| 代码 | 说明 |
|------|------|
| `session.chain.not_found` | 引用的响应 ID 不存在 |
| `session.chain.cycle_detected` | 链遍历发现循环 |
| `session.chain.depth_exceeded` | 链深度超过限制（默认：64） |
| `session.chain.unavailable` | 引用的响应未完成 |
| `session.store.conflict` | 重复保存或父指针不匹配 |

## Server 域

| 代码 | 说明 |
|------|------|
| `server.request.invalid_json` | 请求体不是有效 JSON |
| `server.request.missing_model` | 缺少必需的 `model` 字段 |
| `server.request.invalid_parameter` | 参数验证失败 |
| `server.provider.not_registered` | 提供商没有注册的工厂 |
| `server_error` | 通用服务器错误 |

[配置 Schema](/zh/07-configuration/config-schema)
