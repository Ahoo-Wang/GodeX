# Session Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `src/session` so shared save policy, snapshot cloning, SQLite schema, SQLite row mapping, and store behavior tests have clear responsibilities.

**Architecture:** Keep the public `ResponseSessionStore` contract stable. Use native `bun:sqlite` and extract focused internal modules instead of adding an ORM. Run common store behavior once against both memory and SQLite stores, while keeping backend-specific tests small.

**Tech Stack:** TypeScript, Bun test runner, Bun SQLite, Biome.

---

### Task 1: Add Shared Fixtures And Save Policy

**Files:**
- Create: `src/session/test-fixtures.ts`
- Create: `src/session/save-policy.test.ts`
- Create: `src/session/save-policy.ts`

- [x] **Step 1: Create shared session fixtures**

Create `src/session/test-fixtures.ts`:

```ts
import type { ResponseItem } from "../protocol/openai/responses";
import type { StoredResponseSession } from "./types";

export const userInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "Hello" }],
};

export const secondInput: ResponseItem = {
	type: "message",
	role: "user",
	content: [{ type: "input_text", text: "And population?" }],
};

export function completedTurn(
	id: string,
	previousResponseId: string | null,
	input: ResponseItem | string = userInput,
	metadataProvider = "session-test",
): StoredResponseSession {
	return {
		id,
		previous_response_id: previousResponseId,
		conversation_id: null,
		created_at: 1_764_000_000,
		completed_at: 1_764_000_001,
		status: "completed",
		request: {
			input: typeof input === "string" ? input : [input],
			instructions: "You are helpful.",
			model: "gpt-5.4",
			parallel_tool_calls: true,
			truncation: "disabled",
		},
		response: {
			id,
			output: [
				{
					id: `msg_${id}`,
					type: "message",
					role: "assistant",
					status: "completed",
					content: [{ type: "output_text", text: `output ${id}` }],
				},
			],
			output_text: `output ${id}`,
			usage: {
				input_tokens: 3,
				output_tokens: 2,
				total_tokens: 5,
			},
		},
		metadata: {
			provider: metadataProvider,
		},
	};
}

export function incompleteTurn(
	id: string,
	previousResponseId: string | null = null,
): StoredResponseSession {
	return {
		...completedTurn(id, previousResponseId),
		status: "in_progress",
	};
}

export function cycleTurns(): [StoredResponseSession, StoredResponseSession] {
	return [
		completedTurn("resp_cycle_a", "resp_cycle_b"),
		completedTurn("resp_cycle_b", "resp_cycle_a"),
	];
}
```

- [x] **Step 2: Write failing save policy tests**

Create `src/session/save-policy.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import { assertCanSaveSession } from "./save-policy";
import { completedTurn } from "./test-fixtures";

describe("assertCanSaveSession", () => {
	test("allows new sessions when no expected parent is supplied", () => {
		expect(() =>
			assertCanSaveSession({
				session: completedTurn("resp_1", null),
				existing: null,
			}),
		).not.toThrow();
	});

	test("allows overwrite when an existing session is present", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
				options: { overwrite: true },
			}),
		).not.toThrow();
	});

	test("rejects duplicate sessions without overwrite", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
			}),
		).toThrow(SessionError);
		expect(() =>
			assertCanSaveSession({
				session,
				existing: session,
			}),
		).toThrow("Response session already exists.");
	});

	test("rejects mismatched expected previous response id", () => {
		const session = completedTurn("resp_1", null);

		expect(() =>
			assertCanSaveSession({
				session,
				existing: null,
				options: { expected_previous_response_id: "resp_parent" },
			}),
		).toThrow(SessionError);
		expect(() =>
			assertCanSaveSession({
				session,
				existing: null,
				options: { expected_previous_response_id: "resp_parent" },
			}),
		).toThrow("Response session parent did not match expected previous response ID.");
	});

	test("uses the existing session conflict code", () => {
		const session = completedTurn("resp_1", null);

		try {
			assertCanSaveSession({ session, existing: session });
			throw new Error("Expected conflict");
		} catch (err) {
			expect(err).toBeInstanceOf(SessionError);
			expect(err).toMatchObject({
				code: "session.store.conflict",
				context: {
					responseId: "resp_1",
				},
			});
		}
	});
});
```

- [x] **Step 3: Run save policy tests to verify red**

Run:

```bash
bun test src/session/save-policy.test.ts
```

Expected: FAIL because `src/session/save-policy.ts` does not exist.

- [x] **Step 4: Implement shared save policy**

Create `src/session/save-policy.ts`:

```ts
import { SESSION_CONFLICT, SessionError } from "../error";
import type {
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

export interface SaveSessionPolicyInput {
	session: StoredResponseSession;
	existing: StoredResponseSession | null;
	options?: SaveResponseSessionOptions;
}

export function assertCanSaveSession(input: SaveSessionPolicyInput): void {
	const previousResponseId = input.session.previous_response_id ?? null;

	if (
		input.options?.expected_previous_response_id !== undefined &&
		input.options.expected_previous_response_id !== previousResponseId
	) {
		throw new SessionError(
			SESSION_CONFLICT,
			"Response session parent did not match expected previous response ID.",
			{
				responseId: input.session.id,
				previousResponseId: previousResponseId ?? undefined,
			},
		);
	}

	if (input.existing && !input.options?.overwrite) {
		throw new SessionError(SESSION_CONFLICT, "Response session already exists.", {
			responseId: input.session.id,
			previousResponseId: previousResponseId ?? undefined,
		});
	}
}
```

- [x] **Step 5: Run save policy tests to verify green**

Run:

```bash
bun test src/session/save-policy.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit**

Run:

```bash
git add src/session/test-fixtures.ts src/session/save-policy.test.ts src/session/save-policy.ts
git commit -m "refactor: extract session save policy"
```

### Task 2: Extract Snapshot Clone And Refactor Memory Store

**Files:**
- Create: `src/session/snapshot-clone.test.ts`
- Create: `src/session/snapshot-clone.ts`
- Modify: `src/session/memory.ts`
- Modify: `src/session/memory.test.ts`

- [x] **Step 1: Write failing snapshot clone tests**

Create `src/session/snapshot-clone.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { cloneStoredResponseSession } from "./snapshot-clone";
import { completedTurn } from "./test-fixtures";

describe("cloneStoredResponseSession", () => {
	test("returns a deep clone of a stored response session", () => {
		const session = completedTurn("resp_clone", null);
		const cloned = cloneStoredResponseSession(session);

		expect(cloned).toEqual(session);
		expect(cloned).not.toBe(session);
		expect(cloned.request).not.toBe(session.request);
		expect(cloned.response).not.toBe(session.response);
		expect(cloned.response.output).not.toBe(session.response.output);
	});
});
```

- [x] **Step 2: Run snapshot clone tests to verify red**

Run:

```bash
bun test src/session/snapshot-clone.test.ts
```

Expected: FAIL because `src/session/snapshot-clone.ts` does not exist.

- [x] **Step 3: Implement snapshot clone helper**

Create `src/session/snapshot-clone.ts`:

```ts
import type { StoredResponseSession } from "./types";

export function cloneStoredResponseSession(
	session: StoredResponseSession,
): StoredResponseSession {
	return structuredClone(session);
}
```

- [x] **Step 4: Refactor memory store to use save policy and clone helper**

Update `src/session/memory.ts` to this content:

```ts
import { resolveResponseSessionChain } from "./chain";
import { assertCanSaveSession } from "./save-policy";
import { cloneStoredResponseSession } from "./snapshot-clone";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	ResponseSessionStore,
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

/**
 * In-memory session store for tests, demos, and single-process deployments.
 *
 * The store clones snapshots on read/write so callers cannot mutate persisted
 * state by holding object references.
 */
export class MemoryResponseSessionStore implements ResponseSessionStore {
	private readonly sessions = new Map<ResponseId, StoredResponseSession>();

	constructor(sessions: StoredResponseSession[] = []) {
		for (const session of sessions) {
			this.sessions.set(session.id, cloneStoredResponseSession(session));
		}
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		const session = this.sessions.get(responseId);
		return session ? cloneStoredResponseSession(session) : null;
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		assertCanSaveSession({
			session,
			existing: this.sessions.get(session.id) ?? null,
			options,
		});

		this.sessions.set(session.id, cloneStoredResponseSession(session));
	}

	async resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot> {
		return resolveResponseSessionChain(previousResponseId, {
			...options,
			get: (responseId) => {
				const session = this.sessions.get(responseId);
				return session ? cloneStoredResponseSession(session) : null;
			},
		});
	}

	async delete(responseId: ResponseId): Promise<void> {
		this.sessions.delete(responseId);
	}

	clear(): void {
		this.sessions.clear();
	}
}
```

- [x] **Step 5: Narrow memory-specific tests**

Replace `src/session/memory.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { MemoryResponseSessionStore } from "./memory";
import { completedTurn } from "./test-fixtures";

describe("MemoryResponseSessionStore", () => {
	test("clones constructor sessions so callers cannot mutate initial state", async () => {
		const first = completedTurn("resp_constructor", null);
		const store = new MemoryResponseSessionStore([first]);

		first.response.output_text = "mutated after constructor";

		await expect(store.get("resp_constructor")).resolves.toMatchObject({
			response: { output_text: "output resp_constructor" },
		});
	});

	test("returns cloned sessions so callers cannot mutate stored state", async () => {
		const store = new MemoryResponseSessionStore();
		const first = completedTurn("resp_clone", null);

		await store.save(first);
		first.response.output_text = "mutated after save";
		await expect(store.get("resp_clone")).resolves.toMatchObject({
			response: { output_text: "output resp_clone" },
		});

		const read = await store.get("resp_clone");
		expect(read).not.toBeNull();
		if (!read) throw new Error("Expected stored response");
		read.response.output_text = "mutated read";

		await expect(store.get("resp_clone")).resolves.toMatchObject({
			response: { output_text: "output resp_clone" },
		});
	});

	test("clears stored sessions", async () => {
		const store = new MemoryResponseSessionStore([
			completedTurn("resp_clear", null),
		]);

		await expect(store.get("resp_clear")).resolves.not.toBeNull();
		store.clear();
		await expect(store.get("resp_clear")).resolves.toBeNull();
	});
});
```

- [x] **Step 6: Run focused memory tests**

Run:

```bash
bun test src/session/snapshot-clone.test.ts src/session/memory.test.ts src/session/save-policy.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

Run:

```bash
git add src/session/snapshot-clone.test.ts src/session/snapshot-clone.ts src/session/memory.ts src/session/memory.test.ts
git commit -m "refactor: isolate memory session cloning"
```

### Task 3: Extract SQLite Schema And Row Mapper

**Files:**
- Create: `src/session/sqlite-schema.ts`
- Create: `src/session/sqlite-row-mapper.test.ts`
- Create: `src/session/sqlite-row-mapper.ts`
- Modify: `src/session/sqlite.ts`

- [x] **Step 1: Write failing SQLite row mapper tests**

Create `src/session/sqlite-row-mapper.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	sessionToSQLiteParams,
	sqliteRowToSession,
} from "./sqlite-row-mapper";
import { completedTurn } from "./test-fixtures";

describe("SQLite session row mapper", () => {
	test("maps sessions to SQLite params with JSON snapshots", () => {
		const session = completedTurn("resp_1", null, undefined, "sqlite-test");

		expect(sessionToSQLiteParams(session)).toEqual({
			id: "resp_1",
			previous_response_id: null,
			conversation_id: null,
			created_at: 1_764_000_000,
			completed_at: 1_764_000_001,
			status: "completed",
			request_json: JSON.stringify(session.request),
			response_json: JSON.stringify(session.response),
			metadata_json: JSON.stringify(session.metadata),
		});
	});

	test("maps undefined metadata to null", () => {
		const session = completedTurn("resp_no_metadata", null);
		delete session.metadata;

		expect(sessionToSQLiteParams(session).metadata_json).toBeNull();
	});

	test("maps SQLite rows back to stored sessions", () => {
		const session = completedTurn("resp_1", "resp_parent");
		const row = sessionToSQLiteParams(session);

		expect(sqliteRowToSession(row)).toEqual(session);
	});

	test("omits metadata when SQLite metadata column is null", () => {
		const session = sqliteRowToSession({
			...sessionToSQLiteParams(completedTurn("resp_no_metadata", null)),
			metadata_json: null,
		});

		expect(session).not.toHaveProperty("metadata");
	});
});
```

- [x] **Step 2: Run SQLite row mapper tests to verify red**

Run:

```bash
bun test src/session/sqlite-row-mapper.test.ts
```

Expected: FAIL because `src/session/sqlite-row-mapper.ts` does not exist.

- [x] **Step 3: Implement SQLite schema module**

Create `src/session/sqlite-schema.ts`:

```ts
import type { Database } from "bun:sqlite";

export function migrateResponseSessionSchema(db: Database): void {
	db.run(`
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
    `);
}
```

- [x] **Step 4: Implement SQLite row mapper**

Create `src/session/sqlite-row-mapper.ts`:

```ts
import type { ResponseStatus } from "../protocol/openai/responses";
import type {
	StoredResponseRequestSnapshot,
	StoredResponseSession,
	StoredResponseSnapshot,
} from "./types";

export interface SQLiteResponseSessionRow {
	id: string;
	previous_response_id: string | null;
	conversation_id: string | null;
	created_at: number;
	completed_at: number | null;
	status: ResponseStatus;
	request_json: string;
	response_json: string;
	metadata_json: string | null;
}

export type SQLiteResponseSessionParams = SQLiteResponseSessionRow;

export function sessionToSQLiteParams(
	session: StoredResponseSession,
): SQLiteResponseSessionParams {
	return {
		id: session.id,
		previous_response_id: session.previous_response_id ?? null,
		conversation_id: session.conversation_id ?? null,
		created_at: session.created_at,
		completed_at: session.completed_at ?? null,
		status: session.status,
		request_json: JSON.stringify(session.request),
		response_json: JSON.stringify(session.response),
		metadata_json:
			session.metadata === undefined ? null : JSON.stringify(session.metadata),
	};
}

export function sqliteRowToSession(
	row: SQLiteResponseSessionRow,
): StoredResponseSession {
	const session: StoredResponseSession = {
		id: row.id,
		previous_response_id: row.previous_response_id,
		conversation_id: row.conversation_id,
		created_at: row.created_at,
		completed_at: row.completed_at,
		status: row.status,
		request: JSON.parse(row.request_json) as StoredResponseRequestSnapshot,
		response: JSON.parse(row.response_json) as StoredResponseSnapshot,
	};

	if (row.metadata_json !== null) {
		session.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
	}

	return session;
}
```

- [x] **Step 5: Refactor SQLite store to delegate schema, policy, and mapping**

Update `src/session/sqlite.ts` to this content:

```ts
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { resolveResponseSessionChain } from "./chain";
import { assertCanSaveSession } from "./save-policy";
import {
	type SQLiteResponseSessionRow,
	sessionToSQLiteParams,
	sqliteRowToSession,
} from "./sqlite-row-mapper";
import { migrateResponseSessionSchema } from "./sqlite-schema";
import type {
	ResolveResponseSessionOptions,
	ResponseId,
	ResponseSessionSnapshot,
	ResponseSessionStore,
	SaveResponseSessionOptions,
	StoredResponseSession,
} from "./types";

/**
 * SQLite-backed session store for Responses `previous_response_id` chains.
 *
 * The store keeps API-shaped request/response snapshots as JSON and performs
 * chain validation locally. It does not adapt items into provider messages.
 */
export class SQLiteResponseSessionStore implements ResponseSessionStore {
	readonly db: Database;
	private readonly ownsDatabase: boolean;

	constructor(database: Database | string = ":memory:") {
		if (typeof database === "string") {
			if (database !== ":memory:") {
				const dir = dirname(database);
				mkdirSync(dir, { recursive: true });
			}
			this.db = new Database(database, {
				create: true,
				readwrite: true,
				strict: true,
			});
			this.ownsDatabase = true;
		} else {
			this.db = database;
			this.ownsDatabase = false;
		}

		migrateResponseSessionSchema(this.db);
	}

	async get(responseId: ResponseId): Promise<StoredResponseSession | null> {
		return this.getSync(responseId);
	}

	async save(
		session: StoredResponseSession,
		options?: SaveResponseSessionOptions,
	): Promise<void> {
		const existing = this.getSync(session.id);
		assertCanSaveSession({ session, existing, options });

		this.db
			.query(
				`INSERT INTO response_sessions (
          id,
          previous_response_id,
          conversation_id,
          created_at,
          completed_at,
          status,
          request_json,
          response_json,
          metadata_json
        ) VALUES (
          $id,
          $previous_response_id,
          $conversation_id,
          $created_at,
          $completed_at,
          $status,
          $request_json,
          $response_json,
          $metadata_json
        )
        ON CONFLICT(id) DO UPDATE SET
          previous_response_id = excluded.previous_response_id,
          conversation_id = excluded.conversation_id,
          created_at = excluded.created_at,
          completed_at = excluded.completed_at,
          status = excluded.status,
          request_json = excluded.request_json,
          response_json = excluded.response_json,
          metadata_json = excluded.metadata_json`,
			)
			.run(sessionToSQLiteParams(session));
	}

	async resolveChain(
		previousResponseId: ResponseId,
		options?: ResolveResponseSessionOptions,
	): Promise<ResponseSessionSnapshot> {
		return resolveResponseSessionChain(previousResponseId, {
			...options,
			get: (responseId) => this.getSync(responseId),
		});
	}

	async delete(responseId: ResponseId): Promise<void> {
		this.db
			.query("DELETE FROM response_sessions WHERE id = $id")
			.run({ id: responseId });
	}

	close(): void {
		if (this.ownsDatabase) {
			this.db.close();
		}
	}

	private getSync(responseId: ResponseId): StoredResponseSession | null {
		const row = this.db
			.query<SQLiteResponseSessionRow, { id: string }>(
				`SELECT
          id,
          previous_response_id,
          conversation_id,
          created_at,
          completed_at,
          status,
          request_json,
          response_json,
          metadata_json
        FROM response_sessions
        WHERE id = $id`,
			)
			.get({ id: responseId });

		return row ? sqliteRowToSession(row) : null;
	}
}
```

- [x] **Step 6: Run SQLite mapper and store tests**

Run:

```bash
bun test src/session/sqlite-row-mapper.test.ts src/session/sqlite.test.ts
```

Expected: PASS.

- [x] **Step 7: Commit**

Run:

```bash
git add src/session/sqlite-schema.ts src/session/sqlite-row-mapper.test.ts src/session/sqlite-row-mapper.ts src/session/sqlite.ts
git commit -m "refactor: isolate sqlite session persistence"
```

### Task 4: Add Shared Store Contract Tests And Reduce Duplication

**Files:**
- Create: `src/session/store-contract.test.ts`
- Modify: `src/session/chain.test.ts`
- Modify: `src/session/sqlite.test.ts`
- Modify: `src/session/memory.test.ts`
- Modify: `src/session/contract.test.ts`

- [x] **Step 1: Create shared store contract tests**

Create `src/session/store-contract.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { SessionError } from "../error";
import { MemoryResponseSessionStore } from "./memory";
import { SQLiteResponseSessionStore } from "./sqlite";
import {
	completedTurn,
	cycleTurns,
	incompleteTurn,
	secondInput,
	userInput,
} from "./test-fixtures";
import type { ResponseSessionStore } from "./types";

interface StoreCase {
	name: string;
	create(): ResponseSessionStore;
	close?(store: ResponseSessionStore): void;
}

const storeCases: StoreCase[] = [
	{
		name: "memory",
		create: () => new MemoryResponseSessionStore(),
	},
	{
		name: "sqlite",
		create: () => new SQLiteResponseSessionStore(":memory:"),
		close: (store) => store.close?.(),
	},
];

for (const storeCase of storeCases) {
	describe(`${storeCase.name} ResponseSessionStore behavior`, () => {
		test("saves, reads, overwrites, and deletes response sessions", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);

				await store.save(first, { expected_previous_response_id: null });
				await expect(store.get("resp_1")).resolves.toEqual(first);
				await expect(store.get("missing")).resolves.toBeNull();

				const replacement = {
					...completedTurn("resp_1", null, undefined, storeCase.name),
					response: {
						...first.response,
						output_text: "replacement",
					},
				};

				await expect(store.save(replacement)).rejects.toMatchObject({
					code: "session.store.conflict",
				});
				await store.save(replacement, { overwrite: true });
				await expect(store.get("resp_1")).resolves.toEqual(replacement);

				await store.delete("resp_1");
				await expect(store.get("resp_1")).resolves.toBeNull();
			} finally {
				storeCase.close?.(store);
			}
		});

		test("resolves chains from oldest to newest and flattens input items", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);
				const second = completedTurn(
					"resp_2",
					"resp_1",
					secondInput,
					storeCase.name,
				);

				await store.save(first);
				await store.save(second);

				await expect(store.resolveChain("resp_2")).resolves.toEqual({
					previous_response_id: "resp_2",
					turns: [first, second],
					input_items: [
						userInput,
						...first.response.output,
						secondInput,
						...second.response.output,
					],
				});
			} finally {
				storeCase.close?.(store);
			}
		});

		test("reports missing, unavailable, depth, cycle, and save conflicts", async () => {
			const store = storeCase.create();
			try {
				const first = completedTurn("resp_1", null, undefined, storeCase.name);
				const incomplete = incompleteTurn("resp_pending");
				const [cycleA, cycleB] = cycleTurns();

				await store.save(first);
				await store.save(incomplete);
				await store.save(cycleA);
				await store.save(cycleB);

				await expect(store.resolveChain("missing")).rejects.toMatchObject({
					code: "session.chain.not_found",
				});
				await expect(store.resolveChain("resp_pending")).rejects.toMatchObject({
					code: "session.chain.unavailable",
				});
				await expect(
					store.resolveChain("resp_1", { max_depth: 0 }),
				).rejects.toMatchObject({
					code: "session.chain.depth_exceeded",
				});
				await expect(store.resolveChain("resp_cycle_a")).rejects.toMatchObject({
					code: "session.chain.cycle_detected",
				});

				await expect(
					store.resolveChain("resp_pending", { include_incomplete: true }),
				).resolves.toMatchObject({
					previous_response_id: "resp_pending",
				});

				const conflict = store.save(first, {
					overwrite: true,
					expected_previous_response_id: "nope",
				});
				await expect(conflict).rejects.toBeInstanceOf(SessionError);
				await expect(conflict).rejects.toMatchObject({
					code: "session.store.conflict",
				});
			} finally {
				storeCase.close?.(store);
			}
		});
	});
}
```

- [x] **Step 2: Run shared store contract tests**

Run:

```bash
bun test src/session/store-contract.test.ts
```

Expected: PASS.

- [x] **Step 3: Replace chain tests with fixture-based coverage**

Replace `src/session/chain.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { resolveResponseSessionChain } from "./chain";
import {
	completedTurn,
	cycleTurns,
	incompleteTurn,
	secondInput,
	userInput,
} from "./test-fixtures";

describe("resolveResponseSessionChain", () => {
	test("orders turns oldest to newest and flattens request/response items", async () => {
		const first = completedTurn("resp_1", null);
		const second = completedTurn("resp_2", "resp_1", secondInput);
		const sessions = new Map([
			[first.id, first],
			[second.id, second],
		]);

		await expect(
			resolveResponseSessionChain("resp_2", {
				get: (responseId) => sessions.get(responseId) ?? null,
			}),
		).resolves.toEqual({
			previous_response_id: "resp_2",
			turns: [first, second],
			input_items: [
				userInput,
				...first.response.output,
				secondInput,
				...second.response.output,
			],
		});
	});

	test("preserves string request inputs as user message history", async () => {
		const first = completedTurn("resp_1", null, "Plain text question");
		const sessions = new Map([[first.id, first]]);

		await expect(
			resolveResponseSessionChain("resp_1", {
				get: (responseId) => sessions.get(responseId) ?? null,
			}),
		).resolves.toMatchObject({
			input_items: [
				{
					type: "message",
					role: "user",
					content: [{ type: "input_text", text: "Plain text question" }],
				},
				...first.response.output,
			],
		});
	});

	test("reports missing, unavailable, depth, and cycle errors", async () => {
		const first = completedTurn("resp_1", null);
		const incomplete = incompleteTurn("resp_pending");
		const [cycleA, cycleB] = cycleTurns();
		const sessions = new Map([
			[first.id, first],
			[incomplete.id, incomplete],
			[cycleA.id, cycleA],
			[cycleB.id, cycleB],
		]);
		const get = (responseId: string) => sessions.get(responseId) ?? null;

		await expect(
			resolveResponseSessionChain("missing", { get }),
		).rejects.toMatchObject({
			code: "session.chain.not_found",
		});
		await expect(
			resolveResponseSessionChain("resp_pending", { get }),
		).rejects.toMatchObject({
			code: "session.chain.unavailable",
		});
		await expect(
			resolveResponseSessionChain("resp_1", { get, max_depth: 0 }),
		).rejects.toMatchObject({
			code: "session.chain.depth_exceeded",
		});
		await expect(
			resolveResponseSessionChain("resp_cycle_a", { get }),
		).rejects.toMatchObject({
			code: "session.chain.cycle_detected",
		});

		await expect(
			resolveResponseSessionChain("resp_pending", {
				get,
				include_incomplete: true,
			}),
		).resolves.toMatchObject({
			previous_response_id: "resp_pending",
		});
	});
});
```

- [x] **Step 4: Narrow SQLite-specific tests**

Replace `src/session/sqlite.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SQLiteResponseSessionStore } from "./sqlite";
import { completedTurn } from "./test-fixtures";

describe("SQLiteResponseSessionStore", () => {
	test("creates response session tables and indexes", () => {
		const store = new SQLiteResponseSessionStore(":memory:");
		try {
			const tables = store.db
				.query("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
				.all();
			const indexes = store.db
				.query("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
				.all();

			expect(tables).toContainEqual({ name: "response_sessions" });
			expect(indexes).toContainEqual({
				name: "idx_response_sessions_conversation_id",
			});
			expect(indexes).toContainEqual({
				name: "idx_response_sessions_previous_response_id",
			});
		} finally {
			store.close();
		}
	});

	test("persists sessions across file-backed store instances", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-session-"));
		const dbPath = join(dir, "sessions.sqlite");
		const first = completedTurn("resp_file", null, undefined, "sqlite-test");

		try {
			const writer = new SQLiteResponseSessionStore(dbPath);
			await writer.save(first);
			writer.close();

			const reader = new SQLiteResponseSessionStore(dbPath);
			await expect(reader.get("resp_file")).resolves.toEqual(first);
			reader.close();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("preserves sessions without metadata", async () => {
		const store = new SQLiteResponseSessionStore(":memory:");
		try {
			const withoutMetadata = completedTurn("resp_no_metadata", null);
			delete withoutMetadata.metadata;

			await store.save(withoutMetadata);
			await expect(store.get("resp_no_metadata")).resolves.toEqual(
				withoutMetadata,
			);
		} finally {
			store.close();
		}
	});

	test("does not close externally owned database instances", () => {
		const db = new Database(":memory:");
		const store = new SQLiteResponseSessionStore(db);

		store.close();

		expect(
			db.query("SELECT name FROM sqlite_master WHERE type = 'table'").all(),
		).toContainEqual({ name: "response_sessions" });
		db.close();
	});
});
```

- [x] **Step 5: Keep memory-specific tests narrow**

Verify `src/session/memory.test.ts` contains exactly these three test names:

```bash
rg -n "test\\(" src/session/memory.test.ts
```

Expected output contains:

```text
test("clones constructor sessions so callers cannot mutate initial state"
test("returns cloned sessions so callers cannot mutate stored state"
test("clears stored sessions"
```

- [x] **Step 6: Keep contract interface test focused**

Verify `src/session/contract.test.ts` remains an interface-shape test and does not import concrete stores:

```bash
rg -n "MemoryResponseSessionStore|SQLiteResponseSessionStore" src/session/contract.test.ts
```

Expected: no matches.

- [x] **Step 7: Run all session tests**

Run:

```bash
bun test src/session
```

Expected: PASS.

- [x] **Step 8: Commit**

Run:

```bash
git add src/session/store-contract.test.ts src/session/chain.test.ts src/session/sqlite.test.ts src/session/memory.test.ts src/session/contract.test.ts
git commit -m "test: share session store contract coverage"
```

### Task 5: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-05-27-session-module-refactor.md`

- [x] **Step 1: Run module tests**

Run:

```bash
bun test src/session
```

Expected: PASS.

- [x] **Step 2: Run repository check**

Run:

```bash
bun run check
```

Expected: PASS.

- [x] **Step 3: Mark plan steps complete**

Update this plan checklist so every completed implementation step is marked `[x]`.

- [x] **Step 4: Commit completed plan**

Run:

```bash
git add -f docs/superpowers/plans/2026-05-27-session-module-refactor.md
git commit -m "docs: complete session refactor plan"
```
