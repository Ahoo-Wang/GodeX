# Pino Logger Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom logger with pino, removing the `component` concept, switching events to dot-delimited format, and adding file transport with daily rotation.

**Architecture:** pino as core logger with transport-based worker threads for async I/O. `pino-pretty` for console output, `pino-roll` for daily-rotated file output. A thin wrapper preserves the existing `logger.info("event.name", { attr })` API while delegating to pino internally.

**Tech Stack:** pino, pino-pretty (devDependency), pino-roll

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/config/schema.ts` | Add `ConsoleLoggingConfig`, `FileLoggingConfig`, update `LoggingConfig` |
| Modify | `src/config/index.ts` | Parse new logging config fields in `buildConfig` |
| Modify | `src/config/index.test.ts` | Update tests for new logging config |
| Modify | `src/logger/index.ts` | Replace custom logger with pino-backed implementation |
| Create | `src/logger/transport.ts` | Transport construction (console + file) |
| Rewrite | `src/logger/index.test.ts` | New tests for pino-backed logger |
| Modify | `src/context/application-context.ts` | Change `createLogger` call signature |
| Modify | `src/context/application-context.test.ts` | Update mock logger if needed |
| Modify | `src/context/responses-context.ts` | Replace `child({ component, defaults })` with `child({ bindings })` |
| Modify | `src/context/responses-context.test.ts` | Update child logger assertions |
| Modify | `src/server/index.ts` | Rename event `server_started` → `godex.started` |
| Modify | `src/server/index.test.ts` | Update event name assertion |
| Modify | `src/cli/serve.ts` | Rename event `shutting_down` → `godex.shutting_down` |
| Modify | `src/server/routes/responses/index.ts` | Rename events |
| Modify | `src/server/routes/responses/responses.test.ts` | Update event name assertions |
| Modify | `src/adapter/default-adapter.ts` | Rename events |
| Modify | `src/adapter/default-adapter.test.ts` | Update event name assertions |
| Modify | `src/adapter/transformers/response-session-persistence-transformer.ts` | Rename events |
| Modify | `src/providers/zhipu/capabilities.ts` | Rename events |
| Modify | `src/providers/zhipu/request.ts` | Rename events |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install pino and pino-roll as dependencies, pino-pretty as devDependency**

```bash
cd /Users/ahoo/work/ahoo-git/Godex
bun add pino pino-roll
bun add -d pino-pretty
```

- [ ] **Step 2: Verify installation**

Run: `bun run typecheck`
Expected: PASS (no type errors yet, just adding deps)

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "chore: add pino, pino-pretty, pino-roll dependencies"
```

---

### Task 2: Update Config Schema and Parsing

**Files:**
- Modify: `src/config/schema.ts`
- Modify: `src/config/index.ts`
- Modify: `src/config/index.test.ts`

- [ ] **Step 1: Write the failing test for new logging config in `src/config/index.test.ts`**

Add a test that verifies `buildConfig` parses `console` and `file` sub-configs:

```typescript
test("parses logging config with console and file", () => {
  const config = buildConfig(
    {
      providers: {
        zhipu: { api_key: "test-key", base_url: "https://example.test/api" },
      },
      logging: {
        level: "debug",
        console: { enabled: true, level: "info", pretty: false },
        file: { enabled: true, level: "warn", dir: "/var/log/godex", filename: "godex.log" },
      },
    },
    {},
  );
  expect(config.logging.level).toBe("debug");
  expect(config.logging.console).toEqual({
    enabled: true,
    level: "info",
    pretty: false,
  });
  expect(config.logging.file).toEqual({
    enabled: true,
    level: "warn",
    dir: "/var/log/godex",
    filename: "godex.log",
  });
});

test("logging console and file default to undefined when not set", () => {
  const config = buildConfig(
    {
      providers: {
        zhipu: { api_key: "test-key", base_url: "https://example.test/api" },
      },
    },
    {},
  );
  expect(config.logging.level).toBe("info");
  expect(config.logging.console).toBeUndefined();
  expect(config.logging.file).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/config/index.test.ts`
Expected: FAIL — `logging.console` and `logging.file` are undefined because schema/parsing doesn't support them yet

- [ ] **Step 3: Update `src/config/schema.ts`**

Replace `LoggingConfig` and add new types:

```typescript
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface ConsoleLoggingConfig {
  enabled: boolean;
  level?: LogLevel;
  pretty?: boolean;
}

export interface FileLoggingConfig {
  enabled: boolean;
  level?: LogLevel;
  dir: string;
  filename: string;
}

export interface LoggingConfig {
  level: LogLevel;
  console?: ConsoleLoggingConfig;
  file?: FileLoggingConfig;
}
```

Keep all other types unchanged.

- [ ] **Step 4: Update `src/config/index.ts` `buildConfig` function**

After the line `const level = rawLevel as LogLevel;`, add parsing for `console` and `file`:

```typescript
const consoleConf = parseConsoleLoggingConfig(logging);
const fileConf = parseFileLoggingConfig(logging);
```

Update the return value:

```typescript
return {
  server: { port, host, idle_timeout: idleTimeout },
  default_provider: defaultProvider,
  providers,
  session: {
    backend: sessionBackend,
    ...(sqlitePath ? { sqlite: { path: sqlitePath } } : {}),
  },
  logging: { level, console: consoleConf, file: fileConf },
};
```

Add the two parser functions after `validateHost`:

```typescript
function parseConsoleLoggingConfig(
  logging: Record<string, unknown>,
): ConsoleLoggingConfig | undefined {
  const raw = logging.console;
  if (typeof raw !== "object" || raw === null) return undefined;
  const c = raw as Record<string, unknown>;
  if (c.enabled !== true) return { enabled: false };
  return {
    enabled: true,
    level: typeof c.level === "string" ? (c.level as LogLevel) : undefined,
    pretty: typeof c.pretty === "boolean" ? c.pretty : undefined,
  };
}

function parseFileLoggingConfig(
  logging: Record<string, unknown>,
): FileLoggingConfig | undefined {
  const raw = logging.file;
  if (typeof raw !== "object" || raw === null) return undefined;
  const f = raw as Record<string, unknown>;
  if (f.enabled !== true) return undefined;
  const dir = typeof f.dir === "string" ? f.dir : "";
  const filename = typeof f.filename === "string" ? f.filename : "godex.log";
  return {
    enabled: true,
    level: typeof f.level === "string" ? (f.level as LogLevel) : undefined,
    dir,
    filename,
  };
}
```

Add the imports at the top of the file — `ConsoleLoggingConfig` and `FileLoggingConfig` from `./schema` (already re-exported via `export * from "./schema"`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/config/index.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts src/config/index.ts src/config/index.test.ts
git commit -m "feat: add console and file logging config schema"
```

---

### Task 3: Implement Transport Layer

**Files:**
- Create: `src/logger/transport.ts`

- [ ] **Step 1: Create `src/logger/transport.ts`**

```typescript
import path from "node:path";
import type { TransportTargetOptions } from "pino";
import type { FileLoggingConfig, LoggingConfig } from "../config/schema";

function expandHomeDir(filepath: string): string {
  if (filepath.startsWith("~/")) {
    return path.join(process.env.HOME ?? "", filepath.slice(2));
  }
  return filepath;
}

export function createTransports(
  config: LoggingConfig,
): TransportTargetOptions[] {
  const transports: TransportTargetOptions[] = [];

  if (config.console?.enabled !== false) {
    const consoleLevel = config.console?.level ?? config.level;
    if (config.console?.pretty !== false) {
      transports.push({
        target: "pino-pretty",
        level: consoleLevel,
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          messageKey: "event",
        },
      });
    } else {
      transports.push({
        target: "pino/file",
        level: consoleLevel,
        options: { destination: 1 },
      });
    }
  }

  if (config.file?.enabled) {
    const fileLevel = config.file.level ?? config.level;
    const dir = expandHomeDir(config.file.dir);
    const filepath = path.join(dir, config.file.filename);

    transports.push({
      target: "pino-roll",
      level: fileLevel,
      options: {
        file: filepath,
        frequency: "daily",
        mkdir: true,
        size: "100m",
      },
    });
  }

  return transports;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/logger/transport.ts
git commit -m "feat: add pino transport construction logic"
```

---

### Task 4: Rewrite Logger with Pino Backend

**Files:**
- Modify: `src/logger/index.ts`
- Rewrite: `src/logger/index.test.ts`

- [ ] **Step 1: Write the failing tests in `src/logger/index.test.ts`**

Replace the entire test file:

```typescript
import { describe, expect, test } from "bun:test";
import { createLogger } from ".";
import type { LoggingConfig } from "../config/schema";

function captureOutput<T>(fn: () => T): { output: string[]; result: T } {
  const lines: string[] = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk: unknown) => {
    if (typeof chunk === "string") lines.push(chunk.trim());
    return true;
  };
  try {
    const result = fn();
    return { output: lines, result };
  } finally {
    process.stdout.write = originalWrite;
  }
}

const defaultConfig: LoggingConfig = { level: "info" };

describe("createLogger", () => {
  test("returns a logger with all level methods", () => {
    const logger = createLogger(defaultConfig);
    expect(typeof logger.trace).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  test("exposes the configured level", () => {
    const logger = createLogger(defaultConfig);
    expect(logger.level).toBe("info");
  });

  test("writes JSON with event as top-level field", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger(defaultConfig);
      logger.info("test.event", { key: "value" });
    });
    expect(output.length).toBeGreaterThanOrEqual(1);
    const parsed = JSON.parse(output[output.length - 1]!);
    expect(parsed.event).toBe("test.event");
    expect(parsed.key).toBe("value");
    expect(parsed.level).toBe(30); // pino info
    expect(parsed.time).toBeDefined();
  });

  test("respects log level — filters out lower priority", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger({ level: "warn" });
      logger.info("should_not_appear");
      logger.warn("should_appear");
    });
    expect(output.some((l) => l.includes("should_appear"))).toBe(true);
    expect(output.some((l) => l.includes("should_not_appear"))).toBe(false);
  });

  test("child merges bindings into log entries", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger(defaultConfig);
      const child = logger.child({ request_id: "req_1", response_id: "resp_1" });
      child.info("child.event", { extra: true });
    });
    const parsed = JSON.parse(output[output.length - 1]!);
    expect(parsed.request_id).toBe("req_1");
    expect(parsed.response_id).toBe("resp_1");
    expect(parsed.extra).toBe(true);
  });

  test("child inherits parent level", () => {
    const logger = createLogger(defaultConfig);
    const child = logger.child({ key: "val" });
    expect(child.level).toBe("info");
  });

  test("lazy thunk is NOT called when level is below threshold", () => {
    let thunkCalled = false;
    captureOutput(() => {
      const logger = createLogger({ level: "warn" });
      logger.info("should_not_log", () => {
        thunkCalled = true;
        return { key: "value" };
      });
    });
    expect(thunkCalled).toBe(false);
  });

  test("lazy thunk IS called when level passes", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger(defaultConfig);
      logger.info("lazy.event", () => ({ computed: true }));
    });
    const parsed = JSON.parse(output[output.length - 1]!);
    expect(parsed.computed).toBe(true);
  });

  test("handles no attr", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger(defaultConfig);
      logger.info("no_attr");
    });
    const parsed = JSON.parse(output[output.length - 1]!);
    expect(parsed.event).toBe("no_attr");
  });

  test("timestamp is human-readable format", () => {
    const { output } = captureOutput(() => {
      const logger = createLogger(defaultConfig);
      logger.info("ts.test");
    });
    const parsed = JSON.parse(output[output.length - 1]!);
    expect(parsed.time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/logger/index.test.ts`
Expected: FAIL — `createLogger` signature doesn't match yet

- [ ] **Step 3: Rewrite `src/logger/index.ts`**

Replace the entire file:

```typescript
import pino from "pino";
import type { Logger } from "pino";
import type { LoggingConfig, LogLevel } from "../config/schema";
import { createTransports } from "./transport";

export type { LogLevel };
export type LogAttr = Record<string, unknown> | (() => Record<string, unknown>);

export interface Logger {
  readonly level: LogLevel;
  child(bindings: Record<string, unknown>): Logger;
  trace(event: string, attr?: LogAttr): void;
  debug(event: string, attr?: LogAttr): void;
  info(event: string, attr?: LogAttr): void;
  warn(event: string, attr?: LogAttr): void;
  error(event: string, attr?: LogAttr): void;
}

function resolveAttr(attr: LogAttr | undefined): Record<string, unknown> {
  if (!attr) return {};
  return typeof attr === "function" ? attr() : attr;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
  );
}

function wrapPino(pinoInstance: Logger<never>): Logger {
  function log(level: LogLevel, event: string, attr?: LogAttr): void {
    const resolved = resolveAttr(attr);
    pinoInstance[level]({ event, ...resolved });
  }

  return {
    get level(): LogLevel {
      return pinoInstance.level as LogLevel;
    },
    child(bindings: Record<string, unknown>): Logger {
      return wrapPino(pinoInstance.child(bindings));
    },
    trace(event, attr) {
      log("trace", event, attr);
    },
    debug(event, attr) {
      log("debug", event, attr);
    },
    info(event, attr) {
      log("info", event, attr);
    },
    warn(event, attr) {
      log("warn", event, attr);
    },
    error(event, attr) {
      log("error", event, attr);
    },
  };
}

export function createLogger(config: LoggingConfig): Logger {
  const transports = createTransports(config);

  const pinoInstance = pino(
    {
      level: config.level,
      timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
    },
    pino.transport({ targets: transports }),
  );

  return wrapPino(pinoInstance);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/logger/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/logger/index.ts src/logger/index.test.ts
git commit -m "feat: replace custom logger with pino-backed implementation"
```

---

### Task 5: Update ApplicationContext and ResponsesContext

**Files:**
- Modify: `src/context/application-context.ts`
- Modify: `src/context/application-context.test.ts`
- Modify: `src/context/responses-context.ts`
- Modify: `src/context/responses-context.test.ts`

- [ ] **Step 1: Update `src/context/application-context.ts`**

Change line 33 from:

```typescript
this.logger = createLogger(config.logging.level, { component: "server" });
```

to:

```typescript
this.logger = createLogger(config.logging);
```

Remove the now-unused `component` option parameter.

- [ ] **Step 2: Update `src/context/responses-context.ts`**

Change the logger initialization (around line 37) from:

```typescript
this.logger = app.logger.child({
  component: "stream",
  defaults: { requestId: this.requestId, responseId: this.responseId },
});
```

to:

```typescript
this.logger = app.logger.child({
  request_id: this.requestId,
  response_id: this.responseId,
});
```

- [ ] **Step 3: Update `src/context/responses-context.test.ts`**

The test "creates child logger with requestId and responseId" checks `ctx.logger.level` and `ctx.logger` is not `app.logger`. These assertions still work with the new `child()` signature — no change needed unless it asserts on a `component` property. If it does, remove that assertion.

- [ ] **Step 4: Update `src/context/application-context.test.ts`**

The existing tests create `ApplicationContext` with `logging: { level: "error" }`. This still works since `LoggingConfig` now has optional `console` and `file` fields. No change needed unless tests assert on removed `component` property.

- [ ] **Step 5: Run tests**

Run: `bun test src/context/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/context/application-context.ts src/context/responses-context.ts src/context/
git commit -m "refactor: update context classes to use new logger API"
```

---

### Task 6: Migrate All Event Names

**Files:**
- Modify: `src/server/index.ts`
- Modify: `src/server/index.test.ts`
- Modify: `src/cli/serve.ts`
- Modify: `src/server/routes/responses/index.ts`
- Modify: `src/adapter/default-adapter.ts`
- Modify: `src/adapter/default-adapter.test.ts`
- Modify: `src/adapter/transformers/response-session-persistence-transformer.ts`
- Modify: `src/providers/zhipu/capabilities.ts`
- Modify: `src/providers/zhipu/request.ts`

- [ ] **Step 1: Update `src/server/index.ts`**

Change `logger.info("server_started", ...)` to `logger.info("godex.started", ...)`.

- [ ] **Step 2: Update `src/server/index.test.ts`**

Change the assertion:
```typescript
event: "server_started",
```
to:
```typescript
event: "godex.started",
```

Remove the `component` property from the mock logger if present:
```typescript
const logger: Logger = {
  level: "error",
  child: () => logger,
  // remove: component: "test",
```

- [ ] **Step 3: Update `src/cli/serve.ts`**

Change `logger.info("shutting_down", { signal })` to `logger.info("godex.shutting_down", { signal })`.

- [ ] **Step 4: Update `src/server/routes/responses/index.ts`**

Change:
- `"request_received"` → `"responses.request.received"`
- `"provider_error"` → `"responses.request.provider_error"`
- `"request_error"` → `"responses.request.error"`
- `"unexpected_error"` → `"godex.unexpected_error"`

- [ ] **Step 5: Update `src/adapter/default-adapter.ts`**

Change:
- `"session_save_error"` → `"session.save.error"`
- `"session_saved"` → `"session.saved"`

Also change the attr key `requestId` → `request_id`, `responseId` → `response_id` in the warn call:
```typescript
ctx.logger.warn("session.save.error", {
  request_id: ctx.requestId,
  response_id: response.id,
  error: String(err),
});
```

And:
```typescript
ctx.logger.debug("session.saved", { response_id: responseObject.id });
```

- [ ] **Step 6: Update `src/adapter/default-adapter.test.ts`**

Change the expected warning event:
```typescript
event: "session_save_error",
```
to:
```typescript
event: "session.save.error",
```

And update the expected attr keys from `requestId`/`responseId` to `request_id`/`response_id`:
```typescript
attr: {
  request_id: "req_test",
  response_id: "resp_save_failed",
  error: "Error: session write failed",
},
```

- [ ] **Step 7: Update `src/adapter/transformers/response-session-persistence-transformer.ts`**

Change:
- `"stream_completed"` → `"responses.stream.completed"`
- `"stream_session_save_error"` → `"session.save.stream_error"`

Also update the attr keys: `requestId` → `request_id`.

- [ ] **Step 8: Update `src/providers/zhipu/capabilities.ts`**

Change both occurrences of `"unsupported_parameter_downgraded"` to `"provider.parameter.downgraded"`.

Also update attr keys: `requestId` → `request_id`.

- [ ] **Step 9: Update `src/providers/zhipu/request.ts`**

Change:
- `"unsupported_tool_skipped"` → `"provider.tool.skipped"`
- `"unsupported_parameter_downgraded"` → `"provider.parameter.downgraded"`

Also update attr keys: `requestId` → `request_id`.

- [ ] **Step 10: Run all tests**

Run: `bun test --path-ignore-patterns 'src/e2e/**'`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/server/ src/cli/ src/adapter/ src/providers/zhipu/
git commit -m "refactor: migrate all event names to dot-delimited format"
```

---

### Task 7: Run Full Verification

**Files:**
- None

- [ ] **Step 1: Type check**

Run: `bun run typecheck`
Expected: PASS

- [ ] **Step 2: Lint**

Run: `bun run lint`
Expected: PASS

- [ ] **Step 3: Full test suite**

Run: `bun test --path-ignore-patterns 'src/e2e/**'`
Expected: PASS

- [ ] **Step 4: Final commit (if any lint fixes needed)**

```bash
git add -A
git commit -m "chore: final cleanup for pino logger refactor"
```
