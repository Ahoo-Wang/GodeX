---
title: "Adapter Pattern"
description: "How the DefaultAdapter bridges the Responses API to provider-specific Chat Completions."
---

# Adapter Pattern

The adapter layer is the core translation engine. It sits between the server routes and provider implementations, converting between the OpenAI Responses API protocol and provider-specific Chat Completions formats.

## Adapter Interface

```ts
interface Adapter {
  request(ctx: ResponsesContext): Promise<ResponseObject>;
  stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}
```

The `DefaultAdapter` implements both methods by delegating to the provider's mapper and chat client.

## Non-Streaming Path

```mermaid
flowchart LR
  subgraph input["Input"]
    CTX["ResponsesContext"]
  end
  subgraph adapter["DefaultAdapter"]
    RM["RequestMapper.map()"]
    CC["ChatClient.chat()"]
    RSM["ResponseMapper.map()"]
    SAVE["SessionStore.save()"]
  end
  subgraph output["Output"]
    RES["ResponseObject"]
  end

  CTX --> RM --> CC --> RSM --> SAVE --> RES
```

1. Map the `ResponsesContext` to an upstream request via `RequestMapper`
2. Send to upstream via `ChatClient.chat()`
3. Map the upstream response back via `ResponseMapper`
4. Save the session snapshot

## Streaming Path

```mermaid
flowchart LR
  subgraph input["Input"]
    CTX["ResponsesContext"]
  end
  subgraph adapter["DefaultAdapter"]
    RM["RequestMapper.map()"]
    CC["ChatClient.streamChat()"]
    T1["ProviderEventToResponseTransformer"]
    T2["ResponseSessionPersistenceTransformer"]
  end
  subgraph output["Output"]
    EVENTS["ReadableStream of ResponseStreamEvent"]
  end

  CTX --> RM --> CC --> T1 --> T2 --> EVENTS
```

When `store === false`, the `ResponseSessionPersistenceTransformer` is skipped entirely.

## Provider Mapper Contracts

```mermaid
classDiagram
  direction LR

  class RequestMapper {
    <<interface>>
    +map(ctx) TReq | Promise~TReq~
  }
  class ResponseMapper {
    <<interface>>
    +map(ctx, result) ResponseObject | Promise~ResponseObject~
  }
  class StreamMapper {
    <<interface>>
    +map(ctx, event) ResponseStreamEvent[]
    +buildResponseObject(ctx, state) ResponseObject
  }
  class ProviderMapper {
    <<interface>>
    +request: RequestMapper
    +response: ResponseMapper
    +stream: StreamMapper
  }

  ProviderMapper --> RequestMapper
  ProviderMapper --> ResponseMapper
  ProviderMapper --> StreamMapper
```

Each provider implements these three mapper interfaces to handle the translation between Responses API semantics and its native protocol.

[Stream Pipeline](/02-architecture/stream-pipeline)
