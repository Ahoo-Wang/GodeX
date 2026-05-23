---
title: "Chain Resolution"
description: "How previous_response_id chains are traversed, validated, and reconstructed."
keywords: "GodeX, chain resolution, previous_response_id, session history"
---

# Chain Resolution

When a request includes `previous_response_id`, GodeX must reconstruct the full conversation history by walking the parent pointer chain. This is handled by `resolveResponseSessionChain()`.

## Chain Traversal Algorithm

```mermaid
flowchart TD
  START["Start: previous_response_id"]
  GET["store.get(responseId)"]
  FOUND{"Found?"}
  CYCLE{"Already visited?"}
  DEPTH{"Depth < max?"}
  STATUS{"Status == completed?"}
  PUSH["Push to turns"]
  PARENT["Move to parent pointer"]
  REVERSE["Reverse turns (oldest first)"]
  RESULT["Return ResponseSessionSnapshot"]

  START --> GET
  GET --> FOUND
  FOUND -->|No| ERR404["SessionError: not_found"]
  FOUND -->|Yes| CYCLE
  CYCLE -->|Yes| ERR_CYCLE["SessionError: cycle_detected"]
  CYCLE -->|No| DEPTH
  DEPTH -->|No| ERR_DEPTH["SessionError: depth_exceeded"]
  DEPTH -->|Yes| STATUS
  STATUS -->|No| ERR_UNAVAIL["SessionError: unavailable"]
  STATUS -->|Yes| PUSH --> PARENT --> GET
  PARENT -->|null| REVERSE --> RESULT
```

## Safety Checks

| Check | Error Code | Default Threshold |
|-------|-----------|-------------------|
| Chain not found | `session.chain.not_found` | N/A |
| Cycle detection | `session.chain.cycle_detected` | N/A |
| Depth exceeded | `session.chain.depth_exceeded` | 64 hops |
| Incomplete status | `session.chain.unavailable` | Only completed turns |

## Result Structure

`ResponseSessionSnapshot` contains:
- `previous_response_id`: The originally requested ID
- `turns`: Array of `StoredResponseSession` ordered oldest to newest
- `input_items`: Flattened array of all input and output items across turns, ready for provider message construction

[Transformers](/05-streaming-pipeline/transformers)
