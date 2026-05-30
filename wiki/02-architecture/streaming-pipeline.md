---
title: Streaming Pipeline
description: How GodeX composes a chain of transform streams to process provider SSE events into validated, logged, and persisted Responses API stream events.
---

# Streaming Pipeline

The streaming pipeline is GodeX's most complex execution path. It connects to a provider's SSE stream, maps raw provider deltas into structured `ResponseStreamEvent` objects via the state machine, and then passes them through a composable chain of transform streams that handle error recovery, output contract validation, observability tracing, logging, session persistence, and compatibility diagnostics. Each transformer has a single responsibility, making the pipeline easy to extend and debug.

## At a Glance

| Concern | Component | Key File |
|---------|-----------|----------|
| Pipeline orchestrator | `StreamPipeline` | [stream-pipeline.ts:31](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L31) |
| Event bridge | `ProviderStreamEventBridge` | [stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88) |
| Error handler | `wrapWithErrorHandler` | [stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34) |
| Trace transformer | `TraceTransformer` | [trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8) |
| Log transformer | `ResponseLogTransformer` | [response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13) |
| Contract validation | `ResponseOutputContractValidationTransformer` | [response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13) |
| Session persistence | `ResponseSessionPersistenceTransformer` | [response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19) |
| SSE encoder | `ResponseSseEncoder` | [response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7) |
| Pipe utility | `pipeTransform` | [stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6) |

## Transform Chain

`StreamPipeline.stream` ([stream-pipeline.ts:37](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L37)) constructs a linear chain of `TransformStream` stages connected via `pipeTransform` ([stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6)):

```mermaid
flowchart LR
    subgraph "Transform Chain"
        direction LR
        A["Provider SSE<br>ReadableStream"] --> B["TraceTransformer<br>(raw events)"]
        B --> C["ProviderStreamEventBridge<br>(delta-to-event mapping)"]
        C --> D["wrapWithErrorHandler<br>(error recovery)"]
        D --> E["ResponseOutputContract<br>ValidationTransformer"]
        E --> F["TraceTransformer<br>(transformed events)"]
        F --> G["ResponseLogTransformer"]
        G --> H{"store = false?"}
        H -->|yes| I["CompatibilityLogTransformer"]
        H -->|no| J["ResponseSessionPersistence<br>Transformer"]
        J --> I
        I --> K["Output<br>ReadableStream"]
    end

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style E fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style G fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style J fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style K fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

| Stage | Class | Purpose |
|-------|-------|---------|
| 1 | `TraceTransformer("upstream.stream.event.raw")` | Record raw provider SSE events for tracing |
| 2 | `ProviderStreamEventBridge` | Map provider deltas to `ResponseStreamEvent` via state machine |
| 3 | `wrapWithErrorHandler` | Convert upstream errors to `response.failed` events |
| 4 | `ResponseOutputContractValidationTransformer` | Validate JSON output contracts on terminal events |
| 5 | `TraceTransformer("upstream.stream.event.transformed")` | Record transformed events for tracing |
| 6 | `ResponseLogTransformer` | Log stream completion with usage metrics |
| 7 | `ResponseSessionPersistenceTransformer` | Persist response session (if `store !== false`) |
| 8 | `CompatibilityLogTransformer` | Log compatibility diagnostics at stream end |

## Provider Stream Event Bridge

`ProviderStreamEventBridge` ([stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88)) is the core transformer that converts raw provider SSE events into structured response events. It:

1. Creates a `ResponseStreamStateMachine` with the request's tool identity map
2. On each SSE event, extracts deltas using `ctx.provider.spec.stream.deltas(event.data)` and feeds them to `mapProviderDeltasToEvents` with `deferTerminal: true`
3. On stream end (`flush`), emits the deferred terminal event by calling `machine.finish(machine.deferredFinishReason)`

```mermaid
sequenceDiagram
    autonumber
    participant SSE as Provider SSE
    participant B as ProviderStreamEventBridge
    participant M as ResponseStreamStateMachine
    participant D as mapProviderDeltasToEvents

    SSE->>B: JsonServerSentEvent(data)
    B->>B: provider.spec.stream.deltas(data)
    B->>D: mapProviderDeltasToEvents(machine, deltas, deferTerminal=true)
    D->>M: start() / text() / toolCall() / deferFinish()
    D-->>B: ResponseStreamEvent[]
    B-->>SSE: enqueue events

    Note over SSE,B: Stream ends
    SSE->>B: flush()
    B->>M: finish(deferredFinishReason)
    M-->>B: terminal events
    B-->>SSE: enqueue terminal events
```

The `deferTerminal: true` flag is critical: it prevents the state machine from transitioning to a terminal phase immediately, giving downstream transformers (especially the output contract validator) a chance to inspect and potentially rewrite the terminal event.

## Error Handler

`wrapWithErrorHandler` ([stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34)) wraps the event stream in a `ReadableStream` that catches read errors. When an error occurs:

1. Records the error via `recordTraceError`
2. If the state machine is still in `IDLE` or `IN_PROGRESS`, emits `machine.start()` (if needed) followed by `machine.fail(error)`
3. If the `fail()` call itself throws a known stream lifecycle error (e.g., already terminal), logs at debug level
4. Unexpected failures during error handling are logged at warn level
5. Closes the stream cleanly

```mermaid
flowchart TD
    A["upstream error occurs"] --> B{"machine.phase?"}
    B -->|"IDLE / IN_PROGRESS"| C["emit start() if IDLE"]
    C --> D["emit fail(error)"]
    D --> E{"fail() threw?"}
    E -->|"known stream code"| F["log at debug"]
    E -->|"unexpected"| G["log at warn"]
    B -->|"COMPLETED / FAILED / INCOMPLETE"| H["error after terminal<br>already handled"]
    F --> I["controller.close()"]
    G --> I
    H --> I

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style E fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style F fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style G fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Individual Transformers

### TraceTransformer

`TraceTransformer<T>` ([trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8)) is a generic pass-through transformer that records each chunk as a trace event when tracing is enabled (`ctx.app.traceEnabled`). It tracks a sequence number for ordered trace playback.

### ResponseLogTransformer

`ResponseLogTransformer` ([response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13)) counts events and logs completion when it encounters a terminal event (`response.completed`, `response.failed`, `response.incomplete`). It records usage metrics and upstream latency.

### ResponseOutputContractValidationTransformer

This transformer ([response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13)) validates JSON output contracts on terminal events. If validation fails, it rewrites the event to `response.failed` and suppresses subsequent events. See [Output Contracts](./output-contracts.md) for details.

### ResponseSessionPersistenceTransformer

`ResponseSessionPersistenceTransformer` ([response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19)) persists the response session when it encounters a terminal event. It uses a `persistenceAttempted` flag to ensure only one save attempt occurs. This stage is skipped entirely when `ctx.request.store === false` ([stream-pipeline.ts:74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L74)).

### CompatibilityLogTransformer

`CompatibilityLogTransformer` ([compatibility-log-transformer.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/compatibility-log-transformer.ts#L7)) is the final transformer. It logs all accumulated compatibility diagnostics when the terminal event arrives or on flush, ensuring diagnostics are always emitted even if the stream closes abnormally.

## Upstream Latency Tracking

The pipeline records upstream latency (time to connect to the provider stream) in `upstreamLatencyMillis` via `ctx.attributes.set(ATTR_UPSTREAM_LATENCY_MILLIS, ...)` at [stream-pipeline.ts:42](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L42). This value is later included in the `ResponseLogTransformer` completion log.

## SSE Encoding

After the transform chain, `ResponseSseEncoder` ([response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7)) converts each `ResponseStreamEvent` into an SSE frame (`event: type\ndata: JSON\n\n`) with auto-incrementing sequence numbers.

## Cross-References

- [Stream Reconstruction](./stream-reconstruction.md) -- the state machine and delta-to-event mapping used inside `ProviderStreamEventBridge`
- [Sync Pipeline](./sync-pipeline.md) -- the simpler non-streaming counterpart
- [Output Contracts](./output-contracts.md) -- validation logic used in the transform chain
- [Tool Planning](./tool-planning.md) -- produces `ToolIdentityMap` used by the event bridge

## References

- [stream-pipeline.ts:31](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L31) -- `StreamPipeline` class
- [stream-pipeline.ts:88](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-pipeline.ts#L88) -- `ProviderStreamEventBridge` class
- [stream-error-handler.ts:34](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-error-handler.ts#L34) -- `wrapWithErrorHandler` function
- [trace-transformer.ts:8](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/trace-transformer.ts#L8) -- `TraceTransformer` class
- [response-log-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-log-transformer.ts#L13) -- `ResponseLogTransformer` class
- [response-output-contract-validation-transformer.ts:13](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-output-contract-validation-transformer.ts#L13) -- Contract validation transformer
- [response-session-persistence-transformer.ts:19](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-session-persistence-transformer.ts#L19) -- Session persistence transformer
- [stream-utils.ts:6](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/stream-utils.ts#L6) -- `pipeTransform` utility
- [response-sse-encoder.ts:7](https://github.com/Ahoo-Wang/GodeX/blob/main/src/responses/stream-transforms/response-sse-encoder.ts#L7) -- `ResponseSseEncoder` class
