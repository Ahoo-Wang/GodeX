---
title: "Error Hierarchy"
description: "Godex error class hierarchy: GodexError base class and its four subclasses for server, adapter, provider, and session errors."
---

# Error Hierarchy

All domain errors in Godex extend the abstract `GodexError` base class. This hierarchy provides structured error context, consistent HTTP status mapping, and machine-readable error codes.

## Class Hierarchy

```mermaid
classDiagram
    class GodexError {
        <<abstract>>
        +domain: string
        +code: string
        +status: number
        +context: Record
        +timestamp: number
        +toLogEntry(): Record
    }

    class ServerError {
        +domain: "server"
        +status: 400 (default)
    }

    class AdapterError {
        +domain: "adapter"
        +status: 400 (default)
    }

    class ProviderError {
        +domain: "provider"
        +status: 502 (fixed)
    }

    class SessionError {
        +domain: "session"
        +status: 400 (default)
    }

    GodexError <|-- ServerError
    GodexError <|-- AdapterError
    GodexError <|-- ProviderError
    GodexError <|-- SessionError
```

## GodexError Base Class

Defined in [src/error/godex-error.ts:2](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/godex-error.ts#L2):

| Property | Type | Description |
|---|---|---|
| `domain` | `string` (abstract) | Error domain: "server", "adapter", "provider", "session" |
| `code` | `string` | Machine-readable error code (e.g., `session.chain.not_found`) |
| `status` | `number` | HTTP status code |
| `context` | `Record<string, unknown>` | Additional context (model, provider, response IDs, etc.) |
| `timestamp` | `number` | `Date.now()` when the error was created |
| `message` | `string` | Human-readable description (from `Error`) |
| `cause` | `Error \| undefined` | Optional wrapped error |

### toLogEntry()

Produces a structured log entry:

```typescript
{
  domain: "session",
  code: "session.chain.cycle_detected",
  message: "Previous response chain contains a cycle.",
  status: 400,
  timestamp: 1716000000000,
  responseId: "resp_abc",
  previousResponseId: "resp_xyz"
}
```

## Four Error Subclasses

### ServerError (domain: "server")

[Source](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/server-error.ts)

| Default Status | Use Case |
|---|---|
| `400` | Request validation, missing model, invalid parameters, unknown provider |

Context fields: `path?`, `method?`

### AdapterError (domain: "adapter")

[Source](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/adapter-error.ts)

| Default Status | Use Case |
|---|---|
| `400` | Unsupported parameters, unsupported tools, unsupported input items |

Context fields: `provider`, `model`, `parameter?`

### ProviderError (domain: "provider")

[Source](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/provider-error.ts)

| Fixed Status | Use Case |
|---|---|
| `502` | Upstream HTTP errors (rate limits, timeouts, 5xx) |

Context fields: `provider`, `model`, `upstreamStatus`, `upstreamBody?`

### SessionError (domain: "session")

[Source](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/session-error.ts)

| Default Status | Use Case |
|---|---|
| `400` | Chain not found, cycles, depth exceeded, conflicts |

Context fields: `responseId?`, `previousResponseId?`, `maxDepth?`

## Error-to-HTTP Mapping

The route handler at [src/server/routes/responses/index.ts:77](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/responses/index.ts#L77) maps errors to HTTP responses:

```mermaid
flowchart TD
    A["Error caught in handler"] --> B{"instanceof ProviderError?"}
    B -->|"yes"| C["providerErrorToHttp()"]
    B -->|"no"| D{"instanceof GodexError?"}
    D -->|"yes"| E["godexErrorToHttp()"]
    D -->|"no"| F["jsonError(500, 'server_error')"]

    C --> G{"upstream status?"}
    G -->|"429"| H["429 Rate limit"]
    G -->|"408"| I["408 Timeout"]
    G -->|">= 500"| J["502 Upstream error"]
    G -->|"other"| K["422 Upstream error"]

    E --> L["Use err.status + err.code"]
    F --> M["500 Internal server error"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style E fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style J fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style K fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style L fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style M fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

### Provider Error HTTP Mapping

`providerErrorToHttp` ([src/server/errors.ts:20](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/errors.ts#L20)):

| Upstream Status | HTTP Response | Error Code |
|---|---|---|
| `429` | `429` | `rate_limit_exceeded` |
| `408` | `408` | `request_timeout` |
| `>= 500` | `502` | `upstream_error` |
| Other | `422` | `upstream_error` |

### Standard Error Response Format

All errors return JSON:

```json
{
  "error": {
    "code": "session.chain.not_found",
    "message": "Previous response was not found."
  }
}
```

With an `x-request-id` header when available.

## Provider Error Wrapping

`wrapProviderError` in the Zhipu chat client ([src/providers/zhipu/chat-client.ts:54](https://github.com/Ahoo-Wang/Godex/blob/main/src/providers/zhipu/chat-client.ts#L54)) translates Fetcher errors:

```mermaid
sequenceDiagram
    autonumber
    participant Upstream as Upstream API
    participant Client as ZhipuChatClient
    participant Wrap as wrapProviderError

    Upstream->>Client: Timeout
    Client->>Wrap: FetchTimeoutError
    Wrap-->>Client: ProviderError(PROVIDER_UPSTREAM_TIMEOUT, status: 408)

    Upstream->>Client: HTTP 429
    Client->>Wrap: ExchangeError
    Wrap->>Wrap: Extract status + body
    Wrap-->>Client: ProviderError(PROVIDER_UPSTREAM_ERROR, status: 429)

    Upstream->>Client: HTTP 500
    Client->>Wrap: ExchangeError
    Wrap->>Wrap: Extract status + body
    Wrap-->>Client: ProviderError(PROVIDER_UPSTREAM_ERROR, status: 500)
```

## Error Handling in Route Handler

The `/v1/responses` handler ([src/server/routes/responses/index.ts:77](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/responses/index.ts#L77)) follows this priority:

1. `ProviderError` → log as error, map to HTTP via `providerErrorToHttp`
2. Other `GodexError` → log as warning, map via `godexErrorToHttp`
3. Unknown errors → log as error, return 500 with `server_error` code

## References

- [src/error/godex-error.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/godex-error.ts) — Base class
- [src/error/codes.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/codes.ts) — Error code constants
- [src/error/server-error.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/server-error.ts) — Server errors
- [src/error/adapter-error.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/adapter-error.ts) — Adapter errors
- [src/error/provider-error.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/provider-error.ts) — Provider errors
- [src/error/session-error.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/error/session-error.ts) — Session errors
- [src/server/errors.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/errors.ts) — HTTP error mapping functions
- [src/server/routes/responses/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/responses/index.ts) — Route error handling
