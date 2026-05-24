---
title: "Request Flow"
description: "End-to-end journey of a /v1/responses request through GodeX."
keywords: "GodeX, request flow, sequence diagram, ResponsesContext, ModelResolver"
---

# Request Flow

This page traces the complete lifecycle of a request, from HTTP entry to SSE-encoded response.

## Full Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
  actor C as Client
  participant R as Router
  participant AC as ApplicationContext
  participant RC as ResponsesContext
  participant MR as ModelResolver
  participant SS as SessionStore
  participant REG as Registrar
  participant A as DefaultAdapter
  participant PM as ProviderMapper
  participant CC as ChatClient
  participant UP as Upstream API

  C->>R: POST /v1/responses
  R->>RC: ResponsesContext.create(app, body)

  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: {provider, model}
    RC->>RC: validate provider config

    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: session snapshot
    end

    RC->>REG: resolve(provider)
    REG-->>RC: Provider instance
  deactivate RC

  alt stream = true
    R->>A: adapter.stream(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: upstream request
      A->>CC: streamChat(req)
      CC->>UP: POST (SSE)
      UP-->>CC: SSE chunks
      CC-->>A: ReadableStream of SSE
      A->>A: pipeTransform: ProviderEventToResponse
      A->>A: pipeTransform: SessionPersistence
      A-->>R: ReadableStream of ResponseStreamEvent
    deactivate A
    R->>R: pipeTransform: ResponseSseEncode
    R-->>C: SSE byte stream
  else stream = false
    R->>A: adapter.request(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: upstream request
      A->>CC: chat(req)
      CC->>UP: POST
      UP-->>CC: JSON response
      CC-->>A: upstream response
      A->>PM: response.map(ctx, res)
      PM-->>A: ResponseObject
      A->>SS: save(session)
      A-->>R: ResponseObject
    deactivate A
    R-->>C: JSON response
  end
```

## Key Steps

1. **Model resolution**: `ModelResolver.resolve()` parses the model string. If it contains a `/`, it is treated as an explicit `provider/model` selector and passed through directly. Otherwise, the bare name is looked up in the root-level `models.aliases` map (exact match, then `*` wildcard, then `default_provider` fallback).

2. **Session chain resolution**: When `previous_response_id` is present, `SessionStore.resolveChain()` walks the parent pointer chain, collecting turns in chronological order.

3. **Provider lookup**: `Registrar.resolve()` returns the built `Provider` instance for the resolved provider name.

4. **Request mapping**: `RequestMapper.map()` converts the Responses API request into the provider's native format.

5. **Response mapping**: Either a single `ResponseMapper.map()` call (non-streaming) or a `StreamMapper.map()` pipeline (streaming).

[Adapter Pattern](/02-architecture/adapter-pattern)
