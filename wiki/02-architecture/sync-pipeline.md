---
title: Sync Pipeline
description: How GodeX handles non-streaming requests through ProviderExchange, response reconstruction, output contract validation, and session persistence.
---

# Sync Pipeline

The sync pipeline handles non-streaming Requests API calls end to end. It is the simpler of GodeX's two execution paths: send a single request to the upstream provider, reconstruct the response into the OpenAI Responses format, validate any output contracts, persist the session, and return the complete `ResponseObject`. Understanding the sync pipeline is the foundation for understanding the more complex streaming pipeline.

## At a Glance

| Concern | Component | Key File |
|---------|-----------|----------|
| Pipeline orchestrator | `SyncRequestPipeline` | [sync-request-pipeline.ts:25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L25) |
| Provider exchange | `ProviderExchange` | [provider-exchange.ts:25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L25) |
| Bridge interface | `ResponsesBridge` | [bridge.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/bridge.ts#L7) |
| Runtime wiring | `ResponsesBridgeRuntime` | [runtime.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19) |
| Session persistence | `saveResponseSession` | [response-session-persistence.ts:5](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/response-session-persistence.ts#L5) |

## Pipeline Steps

`SyncRequestPipeline.request` ([sync-request-pipeline.ts:31](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L31)) executes seven steps in sequence:

| Step | Operation | Key Code |
|------|-----------|----------|
| 1 | Build provider request and call upstream | `exchange.request(ctx)` |
| 2 | Reconstruct response object | `reconstructResponseObject(...)` |
| 3 | Validate output contract | `validateResponseOutputContract(...)` |
| 4 | Record trace usage | `recordTraceUsage(ctx, response.usage)` |
| 5 | Log completion | `ctx.logger.info(...)` |
| 6 | Log diagnostics | `logDiagnostics(ctx, ...)` |
| 7 | Save response session | `saveResponseSession(...)` |

```mermaid
sequenceDiagram
    autonumber
    participant C as Caller
    participant S as SyncRequestPipeline
    participant E as ProviderExchange
    participant P as Provider

    C->>S: request(ctx)
    S->>E: request(ctx)
    E->>E: buildProviderRequest(ctx, stream=false)
    E->>P: provider.request(built.request)
    P-->>E: providerResponse
    E-->>S: {providerResponse, built}
    S->>S: reconstructResponseObject(...)
    S->>S: validateResponseOutputContract(...)
    S->>S: recordTraceUsage(ctx, response.usage)
    S->>S: logger.info("responses.request.completed")
    S->>S: logDiagnostics(ctx, ...)
    S->>S: saveResponseSession(store, response, ctx)
    S-->>C: ResponseObject
```

## Provider Exchange

`ProviderExchange` ([provider-exchange.ts:25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L25)) encapsulates the interaction with the upstream provider. For sync requests:

1. **Build request**: `buildProviderRequest(ctx, false)` constructs the provider-specific chat completion request, including tool planning and output contract setup ([provider-exchange.ts:73](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L73))
2. **Trace request**: Records the raw provider request for observability
3. **Call upstream**: Awaits `ctx.provider.request(providerRequest)` -- the actual HTTP call
4. **Trace response**: Records the raw provider response
5. **Return**: Provides both the raw response and the built request metadata

The exchange also records tool decision diagnostics ([provider-exchange.ts:102](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L102)) and sets the output contract slot on the context ([provider-exchange.ts:98](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L98)).

## Response Reconstruction

After the exchange returns, the pipeline calls `reconstructResponseObject` ([sync-request-pipeline.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L34)) with:

| Parameter | Source |
|-----------|--------|
| `requestId` | `ctx.requestId` |
| `responseId` | `ctx.responseId` |
| `createdAt` | `ctx.createdAt` |
| `completedAt` | `Math.floor(Date.now() / 1000)` |
| `provider` | `ctx.provider.name` |
| `model` | `ctx.resolved.model` |
| `providerResponse` | Raw provider response |
| `accessor` | `ctx.provider.spec.response` |
| `toolIdentity` | Built tool declarations |
| `outputContract` | Built output contract plan |
| `echo` | Request echo fields from `responseRequestEchoFields` |

The echo fields ([response-request-echo.ts:4](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/response-request-echo.ts#L4)) mirror selected request parameters back onto the response object, including `instructions`, `temperature`, `tools`, `tool_choice`, and many others.

## Output Contract Validation

After reconstruction, `validateResponseOutputContract` checks that the output satisfies the planned contract. This is especially important when `json_schema` was degraded to `json_object`: the `requiresValidJson` flag triggers a `JSON.parse` on the output text. See [Output Contracts](./output-contracts.md) for the full validation logic.

## Session Persistence

`saveResponseSession` ([response-session-persistence.ts:5](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/response-session-persistence.ts#L5)) stores the response session if `ctx.request.store !== false`. The stored session includes:

| Section | Fields |
|---------|--------|
| Session metadata | `id`, `previous_response_id`, `created_at`, `completed_at`, `status` |
| Request snapshot | `input`, `instructions`, `model`, `tools`, `tool_choice`, `reasoning`, `text`, `truncation` |
| Response snapshot | `id`, `output`, `output_text`, `usage`, `error`, `incomplete_details` |

Session save errors are caught and logged at warn level, never failing the request ([sync-request-pipeline.ts:62](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L62)).

## Runtime Wiring

`ResponsesBridgeRuntime` ([runtime.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19)) creates a shared `ProviderExchange` instance and wires it to both the `SyncRequestPipeline` and `StreamPipeline`. It implements the `ResponsesBridge` interface:

```mermaid
classDiagram
    class ResponsesBridge {
        <<interface>>
        +request(ctx) Promise~ResponseObject~
        +stream(ctx) Promise~ReadableStream~
    }
    class ResponsesBridgeRuntime {
        -syncPipeline: ResponsesSyncPipeline
        -streamPipeline: ResponsesStreamPipeline
        +request(ctx) Promise~ResponseObject~
        +stream(ctx) Promise~ReadableStream~
    }
    class SyncRequestPipeline {
        -exchange: SyncProviderExchange
        -saveSession: SaveResponseSession
        +request(ctx) Promise~ResponseObject~
    }
    class ProviderExchange {
        +request(ctx) Promise~ProviderRequestExchangeResult~
        +stream(ctx) Promise~ProviderStreamExchangeResult~
    }

    ResponsesBridge <|.. ResponsesBridgeRuntime
    ResponsesBridgeRuntime --> SyncRequestPipeline
    ResponsesBridgeRuntime --> ProviderExchange
    SyncRequestPipeline --> ProviderExchange
```

## Logging and Observability

The sync pipeline emits structured log events at key points:

| Event | Level | Context |
|-------|-------|---------|
| `provider.request.sending` | debug | provider, model, stream=false |
| `provider.response.received` | debug | provider, model, upstreamDurationMillis |
| `responses.request.completed` | info | status, model, outputCount, durationMillis, usage, cacheHitRatio |
| `session.save.error` | warn | request_id, response_id, error |

Trace events are recorded for the raw request body, raw response body, and usage metrics via `recordTraceRequest`, `recordTraceEvent`, and `recordTraceUsage`.

## Cross-References

- [Streaming Pipeline](./streaming-pipeline.md) -- the streaming counterpart with a composable transform chain
- [Output Contracts](./output-contracts.md) -- validation logic used after reconstruction
- [Stream Reconstruction](./stream-reconstruction.md) -- how streaming deltas are reconstructed (contrast with sync reconstruction)
- [Tool Planning](./tool-planning.md) -- tool declarations consumed during request building

## References

- [sync-request-pipeline.ts:25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/sync-request-pipeline.ts#L25) -- `SyncRequestPipeline` class
- [provider-exchange.ts:25](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/provider-exchange.ts#L25) -- `ProviderExchange` class
- [bridge.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/bridge.ts#L7) -- `ResponsesBridge` interface
- [runtime.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/runtime.ts#L19) -- `ResponsesBridgeRuntime` class
- [response-session-persistence.ts:5](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/response-session-persistence.ts#L5) -- `saveResponseSession` function
- [response-request-echo.ts:4](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/response-request-echo.ts#L4) -- `responseRequestEchoFields` function
