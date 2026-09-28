---
title: "Request Flow"
description: "End-to-end journey of a /v1/responses request through GodeX."
keywords: "GodeX, request flow, sequence diagram, ResponsesContext, ProviderExchange"
---

# Request Flow

This page traces the complete lifecycle of a request, from HTTP entry to SSE-encoded response.

## Full Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
  actor C as Client
  participant R as Routes
  participant AC as ApplicationContext
  participant RC as ResponsesContext
  participant MR as ModelResolver
  participant SS as SessionStore
  participant REG as Registrar
  participant RT as ResponsesBridgeRuntime
  participant EX as ProviderExchange
  participant BR as bridge/request
  participant PE as ProviderEdge
  participant UP as Upstream API

  C->>R: POST /v1/responses
  R->>R: parse and validate JSON envelope
  R->>RC: createResponsesContext(app, body)

  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: {provider, model}
    RC->>RC: validate provider config

    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: session snapshot
    end

    RC->>REG: resolve(provider)
    REG-->>RC: ProviderEdge
  deactivate RC

  alt stream = true
    R->>RT: runtime.stream(ctx)
    activate RT
      RT->>EX: exchange.stream(ctx)
      activate EX
        EX->>BR: buildChatCompletionRequest(ctx)
        BR-->>EX: chat request + compatibility/tool/output plans
        EX->>PE: stream(providerRequest)
        PE->>UP: POST (SSE)
        UP-->>PE: SSE chunks
        PE-->>EX: provider SSE stream
      deactivate EX
      RT->>RT: bridge deltas via ResponseStreamStateMachine
      RT->>RT: validate output contract
      RT->>RT: trace, log, persist session
      RT-->>R: ReadableStream of ResponseStreamEvent
    deactivate RT
    R->>R: SSE encode
    R-->>C: text/event-stream
  else stream = false
    R->>RT: runtime.request(ctx)
    activate RT
      RT->>EX: exchange.request(ctx)
      activate EX
        EX->>BR: buildChatCompletionRequest(ctx)
        BR-->>EX: chat request + compatibility/tool/output plans
        EX->>PE: request(providerRequest)
        PE->>UP: POST
        UP-->>PE: JSON response
        PE-->>EX: provider response
      deactivate EX
      RT->>RT: reconstruct ResponseObject
      RT->>RT: validate output contract
      RT->>RT: record trace usage, log diagnostics
      RT->>SS: save session (unless store=false)
      RT-->>R: ResponseObject
    deactivate RT
    R-->>C: JSON
  end
```

## Key Steps

1. **Request parsing**: `parseResponseRequest()` validates the JSON envelope and returns a structured body or an error response.

2. **Context creation**: `createResponsesContext()` resolves the model, validates the provider config, optionally resolves the session chain, and resolves the `ProviderEdge` from the registrar.

3. **Model resolution**: `ModelResolver.resolve()` parses the model string. If it contains a `/`, it is treated as an explicit `provider/model` selector. Otherwise, the bare name is looked up in the `models.aliases` map (exact match, then `*` wildcard, then `default_provider` fallback).

4. **Session chain resolution**: When `previous_response_id` is present, `SessionStore.resolveChain()` walks the parent pointer chain, collecting turns in chronological order.

5. **Provider lookup**: `Registrar.resolve()` returns the built `ProviderEdge` for the resolved provider name.

6. **Request building**: `buildChatCompletionRequest()` in the bridge kernel plans compatibility, tools, and output contracts, then normalizes messages.

7. **Response reconstruction**: The sync pipeline reconstructs a `ResponseObject` via `reconstructResponseObject()`. The stream pipeline maps deltas through `ResponseStreamStateMachine`.

[Bridge Kernel](/02-architecture/bridge-kernel)
