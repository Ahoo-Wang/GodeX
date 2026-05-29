---
title: "Testing Guide"
description: "Unit, integration, and end-to-end testing strategies in GodeX."
keywords: "GodeX, testing, unit tests, e2e, Bun test"
---

# Testing Guide

GodeX uses a layered testing approach: unit tests for individual modules, integration tests for component interactions, and E2E tests with mocked upstream servers.

## Test Commands

```bash
bun run test         # Unit + integration tests (excludes src/e2e)
bun run test:e2e     # E2E with mocked upstream
bun run test:zhipu   # Live Zhipu tests (requires ZHIPU_API_KEY)
bun run test:coverage # Coverage report
bun run ci           # Full CI pipeline (typecheck + biome ci + test + e2e)
```

## Test Structure

```
src/
├── bridge/
│   ├── compatibility/*.test.ts
│   ├── tools/*.test.ts
│   ├── output/*.test.ts
│   ├── request/*.test.ts
│   ├── response/*.test.ts
│   ├── stream/*.test.ts
│   ├── provider-spec/*.test.ts
│   └── finish-reason/*.test.ts
├── config/
│   ├── builder.test.ts
│   ├── env.test.ts
│   └── raw.test.ts
├── context/
│   ├── application-context.test.ts
│   ├── responses-context.test.ts
│   └── responses-context-factory.test.ts
├── e2e/
│   ├── e2e.test.ts
│   ├── deepseek.e2e.test.ts
│   ├── trace.test.ts
│   └── zhipu-api.test.ts
├── error/*.test.ts
├── providers/
│   ├── registrar.test.ts
│   ├── builtin.test.ts
│   ├── provider-conformance.test.ts
│   └── deepseek/provider.test.ts
├── resolver/*.test.ts
├── responses/
│   ├── runtime.test.ts
│   ├── provider-exchange.test.ts
│   ├── stream-pipeline.test.ts
│   ├── sync-request-pipeline.test.ts
│   └── stream-transforms/*.test.ts
├── server/
│   ├── index.test.ts
│   └── routes/**/*.test.ts
├── session/*.test.ts
├── trace/*.test.ts
└── module-boundaries.test.ts
```

## Testing Patterns

**Module boundary tests** (`module-boundaries.test.ts`): Verify that module import boundaries are respected — no direct imports across forbidden boundaries.

**Provider conformance tests**: Shared test suite that validates any provider implementation against the `ProviderEdge` contract.

**Session store tests**: Both `MemoryResponseSessionStore` and `SQLiteResponseSessionStore` share the same test contract (`store-contract.test.ts`), ensuring behavioral parity.

**E2E tests**: Start a real GodeX server on a dynamic port with a mocked upstream provider, then exercise the full request lifecycle including streaming.

## Coverage

Coverage is tracked via [Codecov](https://codecov.io/gh/Ahoo-Wang/GodeX).

[CI/CD & Publishing](/09-deployment/ci-cd)
