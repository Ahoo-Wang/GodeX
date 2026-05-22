---
title: "Stream State"
description: "How StreamState accumulates partial results during streaming."
---

# Stream State

The `StreamState` object is the mutable accumulator used by the `SessionPersistenceTransformer` to collect partial results as stream events arrive.

## State Structure

```mermaid
classDiagram
  direction TB

  class StreamState {
    +output: ResponseItem[]
    +outputText: string
    +usage: ResponseUsage or null
    +status: ResponseStatus
    +model: string
    +error: ResponseError or null
    +incompleteDetails: IncompleteDetails or null
  }
```

## Accumulation Flow

As each `ResponseStreamEvent` flows through the transformer:

1. **Content delta events** append text to `outputText` and track the current content item
2. **Tool call events** accumulate function call arguments and track tool call items
3. **Usage events** update the `usage` counters
4. **Terminal events** set the final `status` and trigger session save

When the terminal event arrives, `StreamMapper.buildResponseObject(ctx, state)` constructs the complete `ResponseObject` from the accumulated state.

[Error Hierarchy](/en/06-error-handling/error-hierarchy)
