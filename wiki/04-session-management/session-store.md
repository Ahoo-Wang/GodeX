---
title: "Session Store"
description: "ResponseSessionStore interface and the Memory and SQLite implementations."
---

# Session Store

The session store persists response snapshots to support the `previous_response_id` chain resolution pattern. Each completed response is saved with enough data to reconstruct the conversation history later.

## Interface

```mermaid
classDiagram
  direction TB

  class ResponseSessionStore {
    <<interface>>
    +get(id) Promise~StoredResponseSession or null~
    +save(session, opts) Promise~void~
    +resolveChain(id, opts) Promise~ResponseSessionSnapshot~
    +delete(id) Promise~void~
    +close() void
  }

  class MemoryResponseSessionStore {
    -sessions: Map
  }

  class SQLiteResponseSessionStore {
    +db: Database
    -ownsDatabase: boolean
  }

  ResponseSessionStore <|.. MemoryResponseSessionStore
  ResponseSessionStore <|.. SQLiteResponseSessionStore
```

## Stored Data

Each `StoredResponseSession` contains:

| Field | Description |
|-------|-------------|
| `id` | Response ID (e.g., `resp_abc123`) |
| `previous_response_id` | Parent pointer for chain traversal |
| `created_at` / `completed_at` | Unix timestamps |
| `status` | Response status (`completed`, etc.) |
| `request` | Snapshot of input, instructions, model, tools |
| `response` | Snapshot of output, usage, error |

## Backend Selection

```yaml
session:
  backend: sqlite          # or "memory"
  sqlite:
    path: ./data/sessions.db
```

| Backend | Use Case |
|---------|----------|
| `memory` | Tests, demos, single-process ephemeral deployments |
| `sqlite` | Production, persistent history across restarts |

## Implementation Details

**Memory store**: Uses a `Map` with `structuredClone()` on read/write to prevent reference mutation. No resource cleanup needed.

**SQLite store**: Auto-creates the database file and schema on construction. Uses `bun:sqlite` for synchronous reads within the async chain resolution algorithm. Creates indexes on `previous_response_id` and `conversation_id` for chain traversal performance.

[Chain Resolution](/04-session-management/chain-resolution)
