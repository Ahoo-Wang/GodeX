# Logger Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the logger module into focused responsibilities while preserving the existing application-facing `Logger`, `createLogger`, `wrapLogTape`, and `configureLogging` entrypoints.

**Architecture:** Keep `configureLogging` as the orchestration boundary for applying LogTape configuration. Move reusable pure responsibilities into `levels`, `paths`, and `sinks`, and move runtime logger implementations into `noop-logger` and `logtape-logger`.

**Tech Stack:** TypeScript, Bun test runner, LogTape, Biome.

---

### Task 1: Split Level And Path Helpers

**Files:**
- Create: `src/logger/levels.ts`
- Create: `src/logger/paths.ts`
- Test: `src/logger/levels.test.ts`
- Test: `src/logger/paths.test.ts`
- Modify: `src/logger/configure.ts`

- [x] **Step 1: Write failing helper tests**

Add tests for `toLogTapeLevel`, `minLogTapeLevel`, and `expandHomeDir`.

- [x] **Step 2: Run tests to verify red**

Run: `bun test src/logger/levels.test.ts src/logger/paths.test.ts`

Expected: FAIL because the new modules do not exist.

- [x] **Step 3: Implement helpers**

Move level mapping and home-dir expansion out of `configure.ts`.

- [x] **Step 4: Run tests to verify green**

Run: `bun test src/logger/levels.test.ts src/logger/paths.test.ts`

Expected: PASS.

### Task 2: Split Sink Construction

**Files:**
- Create: `src/logger/sinks.ts`
- Test: `src/logger/sinks.test.ts`
- Modify: `src/logger/configure.ts`

- [x] **Step 1: Write failing sink tests**

Add tests that verify console sink definitions, file sink definitions, disabled transport filtering, and lowest-level calculation.

- [x] **Step 2: Run tests to verify red**

Run: `bun test src/logger/sinks.test.ts`

Expected: FAIL because `buildLogSinks` does not exist.

- [x] **Step 3: Implement sink builder**

Move console/file sink construction into `buildLogSinks(config)`.

- [x] **Step 4: Run tests to verify green**

Run: `bun test src/logger/sinks.test.ts src/logger/configure.test.ts`

Expected: PASS.

### Task 3: Split Logger Implementations

**Files:**
- Create: `src/logger/contract.ts`
- Create: `src/logger/noop-logger.ts`
- Create: `src/logger/logtape-logger.ts`
- Test: `src/logger/noop-logger.test.ts`
- Modify: `src/logger/logger.ts`
- Modify: `src/logger/index.test.ts`

- [x] **Step 1: Write failing implementation tests**

Add focused tests for noop child identity and no-op level methods.

- [x] **Step 2: Run tests to verify red**

Run: `bun test src/logger/noop-logger.test.ts`

Expected: FAIL because `createNoopLogger` is not exported from the new module.

- [x] **Step 3: Implement split**

Move public contracts to `contract.ts`, noop implementation to `noop-logger.ts`, and LogTape wrapper to `logtape-logger.ts`.

- [x] **Step 4: Run tests to verify green**

Run: `bun test src/logger`

Expected: PASS.

### Task 4: Final Verification

**Files:**
- Modify: `src/logger/index.ts`
- Modify: any imports required by the split.

- [x] **Step 1: Run logger tests**

Run: `bun test src/logger`

Expected: PASS.

- [x] **Step 2: Run repository check**

Run: `bun run check`

Expected: PASS.

- [x] **Step 3: Run coverage**

Run: `bun run test:coverage`

Expected: PASS.
