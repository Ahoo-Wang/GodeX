# Session Module Refactor Design

## Goal

Refactor `src/session` so persistence responsibilities are explicit, shared behavior is tested once, and adding a future session backend does not require copying conflict checks, fixture setup, or SQLite row mapping logic.

The public `ResponseSessionStore` contract remains stable. This refactor is internal cleanup for readability, cohesion, and extensibility.

## Current State

`src/session` already has a good domain boundary:

- `types.ts` defines stored response session snapshots and the `ResponseSessionStore` interface.
- `chain.ts` resolves `previous_response_id` chains, detects missing parents, cycles, depth overflow, and incomplete responses.
- `memory.ts` provides an in-memory store with clone-on-read/write semantics.
- `sqlite.ts` provides a SQLite-backed store using `bun:sqlite`.

The technical debt is inside the storage implementations and tests:

- `MemoryResponseSessionStore.save()` and `SQLiteResponseSessionStore.save()` duplicate parent conflict and overwrite checks.
- `SQLiteResponseSessionStore` owns database opening, schema migration, command SQL, JSON serialization, and row-to-domain mapping.
- `memory.test.ts`, `sqlite.test.ts`, and `chain.test.ts` duplicate completed-turn fixtures and chain scenarios.
- `contract.test.ts` verifies the interface shape but does not run reusable behavior tests against both real stores.

## ORM Decision

Do not introduce Drizzle ORM in this refactor.

Drizzle supports `bun:sqlite`, so it remains a viable future option. It is not a good fit for this specific PR because the session store has one table and simple access patterns. The current debt is not caused by missing ORM features; it is caused by unclear module boundaries around save policy, schema setup, and row mapping.

Adding Drizzle only for sessions would also split persistence style from `src/trace/sqlite.ts`, which still uses native `bun:sqlite`. Migrating both session and trace would be a larger persistence redesign and is out of scope.

The selected approach is native `bun:sqlite` with cleaner persistence boundaries.

## Approaches Considered

### 1. Minimal Test Cleanup

Move duplicated fixtures into a helper and leave production code mostly as-is.

This reduces test noise, but it leaves duplicated save conflict policy and the wide SQLite store class untouched.

### 2. Native SQLite With Focused Session Boundaries

Keep `bun:sqlite`, then extract:

- shared save conflict policy
- clone helper for memory snapshots
- SQLite schema setup
- SQLite row mapping and insert binding
- reusable store contract test suite

This addresses the current debt without changing runtime dependencies or widening the PR.

### 3. Introduce Drizzle ORM

Replace session SQL with Drizzle table definitions and typed queries.

This could help later if persistence grows into multiple related tables and versioned migrations. Right now it adds dependency and migration-tooling surface without removing the most important boundary debt. It also creates a persistence style mismatch with trace storage.

## Selected Design

Use approach 2.

The production session module should remain small and explicit:

```text
src/session/
├── chain.ts
├── index.ts
├── memory.ts
├── save-policy.ts
├── snapshot-clone.ts
├── sqlite.ts
├── sqlite-row-mapper.ts
├── sqlite-schema.ts
└── types.ts
```

### `save-policy.ts`

Owns store-independent save validation:

```ts
interface SaveSessionPolicyInput {
	session: StoredResponseSession;
	existing: StoredResponseSession | null;
	options?: SaveResponseSessionOptions;
}

function assertCanSaveSession(input: SaveSessionPolicyInput): void;
```

This function checks:

- `expected_previous_response_id` matches the session parent pointer when provided
- existing sessions require `overwrite: true`

It throws the existing `SessionError` with `SESSION_CONFLICT`.

### `snapshot-clone.ts`

Owns cloning for in-memory snapshots:

```ts
function cloneStoredResponseSession(
	session: StoredResponseSession,
): StoredResponseSession;
```

This keeps clone-on-read/write semantics visible and testable without hiding the store behavior inside `memory.ts`.

### `sqlite-schema.ts`

Owns table and index creation for response sessions:

```ts
function migrateResponseSessionSchema(db: Database): void;
```

No migration framework is introduced. The schema remains idempotent `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.

### `sqlite-row-mapper.ts`

Owns conversion between SQLite rows and domain sessions:

```ts
interface SQLiteResponseSessionRow { ... }

function sessionToSQLiteParams(session: StoredResponseSession): SQLiteResponseSessionParams;
function sqliteRowToSession(row: SQLiteResponseSessionRow): StoredResponseSession;
```

JSON serialization of request, response, and metadata belongs here. `SQLiteResponseSessionStore` should not directly call `JSON.stringify` or `JSON.parse`.

### `sqlite.ts`

Keeps only SQLite store orchestration:

- open or accept a `Database`
- run schema migration
- call `assertCanSaveSession`
- execute insert/upsert
- execute select/delete
- delegate row mapping
- resolve chains through `resolveResponseSessionChain`
- close owned databases

The class remains the public SQLite backend.

### `memory.ts`

Keeps only in-memory store orchestration:

- hold the `Map`
- clone on constructor/get/save
- call `assertCanSaveSession`
- resolve chains through `resolveResponseSessionChain`
- delete/clear sessions

## Test Design

Create a focused session test helper:

```text
src/session/test-fixtures.ts
```

This helper is not exported from `src/session/index.ts`. It provides:

- `userInput`
- `secondInput`
- `completedTurn(id, previousResponseId, input?, metadataProvider?)`
- `incompleteTurn(id, previousResponseId?)`
- `cycleTurns()`

Create one reusable store behavior test file:

```text
src/session/store-contract.test.ts
```

The file defines local factory cases for `MemoryResponseSessionStore` and `SQLiteResponseSessionStore`, then runs the same behavior cases against both stores. This keeps shared expectations in one place without introducing a non-test module that imports `bun:test`.

The reusable test should cover behavior common to both memory and SQLite stores:

- save, get, overwrite, delete
- reject duplicate save without overwrite
- reject mismatched `expected_previous_response_id`
- resolve chains oldest-to-newest
- flatten request input and response output
- report missing, unavailable, depth, and cycle errors
- include incomplete responses only when explicitly requested

Backend-specific tests remain focused:

- `memory.test.ts`: clone-on-read/write and `clear()`
- `sqlite.test.ts`: file-backed persistence, metadata-null mapping, schema creation, close ownership behavior where practical
- `sqlite-row-mapper.test.ts`: JSON mapping, null metadata, and row/session round trips
- `save-policy.test.ts`: conflict policy in isolation
- `chain.test.ts`: chain algorithm edge cases that do not need a store implementation

## Out Of Scope

- Changing `ResponseSessionStore`
- Changing `StoredResponseSession` shape
- Changing request/response snapshot semantics
- Adding Drizzle or any ORM
- Adding versioned migrations
- Refactoring `src/trace/sqlite.ts`
- Changing session config schema
- Changing `previous_response_id` behavior

## Acceptance Criteria

- `MemoryResponseSessionStore` and `SQLiteResponseSessionStore` share save conflict policy instead of duplicating it.
- SQLite schema setup and row mapping are no longer private responsibilities inside `sqlite.ts`.
- Common store behavior is tested once and executed against both memory and SQLite stores.
- Memory-specific and SQLite-specific tests are smaller and focused on backend-specific behavior.
- `ResponseSessionStore` consumers do not need to change.
- No new runtime dependencies are added.
- `bun test src/session` passes.
- `bun run check` passes.
