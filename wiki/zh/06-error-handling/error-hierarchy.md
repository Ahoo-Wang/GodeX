---
title: "错误层次"
description: "具有域代码的结构化错误类型，用于一致的错误处理和日志记录。"
keywords: "GodeX, 错误层次, GodeXError, ServerError, BridgeError, ProviderError"
---

# 错误层次

GodeX 中所有错误都扩展自抽象 `GodeXError` 基类。每个错误携带域、代码、HTTP 状态、结构化上下文和时间戳。

## 类层次

```mermaid
classDiagram
  direction TB

  class GodeXError {
    <<abstract>>
    +domain: string
    +code: string
    +status: number
    +context: Record
    +timestamp: number
    +toLogEntry() Record
  }

  class ServerError {
    +domain: server
    +status: 400-499
  }

  class BridgeError {
    +domain: bridge
    +status: 400-499
  }

  class ProviderError {
    +domain: provider
    +status: 502
  }

  class SessionError {
    +domain: session
    +status: 400-409
  }

  GodeXError <|-- ServerError
  GodeXError <|-- BridgeError
  GodeXError <|-- ProviderError
  GodeXError <|-- SessionError
```

## 错误域

| 域 | 类 | 触发时机 |
|----|-----|---------|
| `server` | `ServerError` | 无效 JSON、缺少 model、未知提供商、配置验证 |
| `bridge` | `BridgeError` | 不支持的参数/工具/输入项、流状态违规、输出合约失败 |
| `provider` | `ProviderError` | 上游速率限制、超时、5xx 错误、无效使用量数据 |
| `session` | `SessionError` | 链未找到、循环、深度超限、不可用会话 |

[错误码](/zh/06-error-handling/error-codes)
