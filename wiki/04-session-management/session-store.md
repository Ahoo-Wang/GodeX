---
title: "Session Store"
description: "How Godex persists response sessions to support multi-turn conversations via previous_response_id chains."
---

# Session Store

Sessions enable multi-turn conversations through `previous_response_id` chains. When a request includes `previous_response_id`, Godex resolves the full conversation history and feeds it as context to the upstream provider. After each response, the session is persisted for future turns.

## Why Sessions Exist

Without sessions, each request to `/v1/responses` is stateless. The `previous_response_id` mechanism allows clients to build conversations by referencing earlier responses, similar to OpenAI's Responses API. The session store persists the request/response snapshots needed to reconstruct conversation history.

## ResponseSessionStore Interface

Defined in [src/session/index.ts:99](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/index.ts#L99):

| Method | Returns | Description |
|---|---|---|
| `get(responseId)` | `Promise<StoredResponseSession \| null>` | Retrieve one stored response by ID |
| `save(session, options?)` | `Promise<void>` | Persist a response snapshot |
| `resolveChain(previousResponseId, options?)` | `Promise<ResponseSessionSnapshot>` | Resolve full parent chain, oldest to newest |
| `delete(responseId)` | `Promise<void>` | Remove one response by ID |
| `close?()` | `void` | Release resources (optional) |

## StoredResponseSession Schema

Each stored session ([src/session/index.ts:25](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/index.ts#L25)) contains:

| Field | Type | Description |
|---|---|---|
| `id` | `ResponseId` | Response ID (future `previous_response_id` target) |
| `previous_response_id` | `ResponseId \| null` | Parent pointer for chain traversal |
| `conversation_id` | `string \| null` | Reserved for future Conversation API |
| `created_at` | `number` | Unix timestamp |
| `completed_at` | `number \| null` | Completion timestamp |
| `status` | `ResponseStatus` | "completed", "incomplete", "failed", etc. |
| `request` | `StoredResponseRequestSnapshot` | Input, instructions, model, tools, etc. |
| `response` | `StoredResponseSnapshot` | Output, output_text, usage, error |
| `metadata` | `Record<string, unknown>` | Optional metadata |

```mermaid
classDiagram
    class StoredResponseSession {
        +id: ResponseId
        +previous_response_id: ResponseId?
        +conversation_id: string?
        +created_at: number
        +completed_at: number?
        +status: ResponseStatus
        +request: StoredResponseRequestSnapshot
        +response: StoredResponseSnapshot
        +metadata: Record
    }

    class StoredResponseRequestSnapshot {
        +input: ResponseItem[]?
        +instructions: string?
        +model: string?
        +tools: ResponseTool[]?
        +tool_choice: any?
        +parallel_tool_calls: boolean?
        +truncation: string?
    }

    class StoredResponseSnapshot {
        +id: ResponseId
        +output: ResponseItem[]
        +output_text: string?
        +usage: ResponseUsage?
        +error: any?
        +incomplete_details: any?
    }

    StoredResponseSession --> StoredResponseRequestSnapshot
    StoredResponseSession --> StoredResponseSnapshot
```

## Backend Comparison

| Feature | MemoryResponseSessionStore | SQLiteResponseSessionStore |
|---|---|---|
| Persistence | In-memory `Map` | SQLite database |
| Survives restart | No | Yes |
| File | [src/session/memory.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/memory.ts) | [src/session/sqlite.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/sqlite.ts) |
| Config `session.backend` | `"memory"` | `"sqlite"` |
| Default path | N/A | Dev: `./data/sessions.db`, Prod: `~/.godex/data/sessions.db` |
| Cloning | `structuredClone` on read/write | JSON serialization |
| Resource cleanup | `clear()` | `close()` |
| Use case | Testing, demos, single-process | Production deployments |

## SQLite Schema

`SQLiteResponseSessionStore` ([src/session/sqlite.ts:36](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/sqlite.ts#L36)) creates the following schema on construction:

```sql
CREATE TABLE IF NOT EXISTS response_sessions (
  id TEXT PRIMARY KEY,
  previous_response_id TEXT NULL,
  conversation_id TEXT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER NULL,
  status TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT NOT NULL,
  metadata_json TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_response_sessions_previous_response_id
  ON response_sessions(previous_response_id);

CREATE INDEX IF NOT EXISTS idx_response_sessions_conversation_id
  ON response_sessions(conversation_id);
```

Request and response data are stored as JSON strings in `request_json` and `response_json` columns.

## Session Save Flow

The `saveSession` function in `DefaultAdapter` ([src/adapter/default-adapter.ts:61](https://github.com/Ahoo-Wang/Godex/blob/main/src/adapter/default-adapter.ts#L61)) handles both non-streaming and streaming paths:

```mermaid
sequenceDiagram
    autonumber
    participant Adapter as DefaultAdapter
    participant Store as ResponseSessionStore

    Note over Adapter: Non-streaming path
    Adapter->>Adapter: request(ctx) returns ResponseObject
    Adapter->>Store: save(StoredResponseSession)
    Store-->>Adapter: Done

    Note over Adapter: Streaming path
    Adapter->>Adapter: stream(ctx) returns event stream
    Adapter->>Adapter: ResponseSessionPersistenceTransformer intercepts
    Adapter->>Adapter: Terminal event detected
    Adapter->>Adapter: Build final ResponseObject from StreamState
    Adapter->>Store: save(StoredResponseSession)
    Store-->>Adapter: Done
```

### Save Behavior

| Condition | Action |
|---|---|
| `request.store === false` | Skip save entirely |
| Save throws error | Log warning, do not fail the response |
| `overwrite: false` (default) | Throw `SESSION_CONFLICT` if ID exists |
| `overwrite: true` | Upsert the session |

## Session Store Selection

`ApplicationContext` ([src/context/application-context.ts:13](https://github.com/Ahoo-Wang/Godex/blob/main/src/context/application-context.ts#L13)) selects the backend based on config:

```mermaid
flowchart TD
    A["config.session.backend"] -->|"memory"| B["MemoryResponseSessionStore()"]
    A -->|"sqlite"| C["SQLiteResponseSessionStore(path)"]

    C --> D{"path specified?"}
    D -->|"yes"| E["Use specified path"]
    D -->|"no"| F["Use resolveDefaultSqlitePath()"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## References

- [src/session/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/index.ts) — Types and ResponseSessionStore interface
- [src/session/memory.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/memory.ts) — In-memory implementation
- [src/session/sqlite.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/session/sqlite.ts) — SQLite implementation
- [src/adapter/default-adapter.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/adapter/default-adapter.ts) — saveSession function
- [src/context/application-context.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/context/application-context.ts) — Backend selection
