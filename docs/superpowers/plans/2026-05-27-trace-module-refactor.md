# Trace Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split trace integration responsibilities into focused recorders while preserving the existing trace behavior at adapter and transformer call sites.

**Architecture:** Keep `src/trace/index.ts` as the public barrel. Move event, usage, prompt-cache, and context/time responsibilities into small modules so callers do not depend on a broad `integration.ts` file. Preserve the existing exported function names where practical to keep the refactor behavior-neutral.

**Tech Stack:** TypeScript, Bun test runner, Biome.

---

### Task 1: Extract Event And Usage Recorders

**Files:**
- Create: `src/trace/context.ts`
- Create: `src/trace/time.ts`
- Create: `src/trace/event-recorder.ts`
- Create: `src/trace/event-recorder.test.ts`
- Create: `src/trace/usage-recorder.ts`
- Create: `src/trace/usage-recorder.test.ts`
- Modify: `src/trace/index.ts`
- Modify: `src/trace/integration.test.ts`

- [x] **Step 1: Write failing recorder tests**

Add tests that import `recordTraceEvent` from `./event-recorder` and `recordTraceUsage` from `./usage-recorder`.

- [x] **Step 2: Run tests to verify red**

Run: `bun test src/trace/event-recorder.test.ts src/trace/usage-recorder.test.ts`
Expected: FAIL because the new modules do not exist.

- [x] **Step 3: Implement focused recorders**

Create `context.ts` with the minimal trace context type, `time.ts` with `nowTraceMillis`, `event-recorder.ts` for event rows, and `usage-recorder.ts` for usage rows.

- [x] **Step 4: Run tests to verify green**

Run: `bun test src/trace/event-recorder.test.ts src/trace/usage-recorder.test.ts`
Expected: PASS.

### Task 2: Extract Prompt Cache Trace Recorder

**Files:**
- Create: `src/trace/prompt-cache-recorder.ts`
- Create: `src/trace/prompt-cache-recorder.test.ts`
- Modify: `src/trace/index.ts`
- Modify: `src/trace/integration.test.ts`

- [x] **Step 1: Write failing prompt-cache recorder tests**

Move prompt-cache tests to import `analyzePromptCache` from `./prompt-cache-recorder` and keep the existing error-path assertions.

- [x] **Step 2: Run tests to verify red**

Run: `bun test src/trace/prompt-cache-recorder.test.ts`
Expected: FAIL because `prompt-cache-recorder.ts` does not exist.

- [x] **Step 3: Implement prompt-cache recorder**

Move prompt-cache analysis, detection, observation update, and request trace row construction into `prompt-cache-recorder.ts`.

- [x] **Step 4: Run tests to verify green**

Run: `bun test src/trace/prompt-cache-recorder.test.ts`
Expected: PASS.

### Task 3: Retire Broad Integration Module

**Files:**
- Delete: `src/trace/integration.ts`
- Delete: `src/trace/integration.test.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/transformers/trace-transformer.ts`
- Modify: `src/adapter/transformers/response-log-transformer.ts`
- Modify: `src/trace/index.ts`

- [x] **Step 1: Update imports to focused trace barrel exports**

Import `analyzePromptCache`, `recordTraceEvent`, and `recordTraceUsage` through `../trace` or `../../trace` instead of `../trace/integration`.

- [x] **Step 2: Delete the broad integration file**

Remove `src/trace/integration.ts` after its responsibilities have moved to focused modules.

- [x] **Step 3: Run trace and adapter tests**

Run: `bun test src/trace src/adapter`
Expected: PASS.

### Task 4: Final Verification

**Files:**
- Modify: `docs/superpowers/plans/2026-05-27-trace-module-refactor.md`

- [x] **Step 1: Mark executed plan steps complete**

Update this plan checklist after the implementation and tests have passed.

- [x] **Step 2: Run repository check**

Run: `bun run check`
Expected: PASS.

- [x] **Step 3: Run coverage**

Run: `bun run test:coverage`
Expected: PASS.
