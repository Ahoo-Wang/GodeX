---
title: "Testing Guide"
description: "Unit, integration, and end-to-end testing strategies in Godex."
---

# Testing Guide

Godex uses a layered testing approach: unit tests for individual modules, integration tests for component interactions, and E2E tests with mocked upstream servers.

## Test Commands

```bash
bun run test         # Unit + integration tests
bun run test:e2e     # E2E with mocked upstream
bun run ci           # Full CI pipeline (typecheck + lint + test + e2e)
```

## Test Structure

```
src/
├── adapter/
│   ├── default-adapter.test.ts
│   ├── capabilities.test.ts
│   ├── mapper/contract.test.ts
│   └── transformers/*.test.ts
├── config/
│   ├── env.test.ts
│   └── loader.test.ts
├── context/
│   ├── application-context.test.ts
│   └── responses-context.test.ts
├── e2e/
│   ├── e2e.test.ts
│   └── zhipu-api.test.ts
├── error/*.test.ts
├── providers/
│   ├── registrar.test.ts
│   └── zhipu/*.test.ts
├── resolver/index.test.ts
├── server/*.test.ts
└── session/*.test.ts
```

## Testing Patterns

**Module boundary tests** (`module-boundaries.test.ts`): Verify that module import boundaries are respected — no direct imports across forbidden boundaries.

**Session store tests**: Both `MemoryResponseSessionStore` and `SQLiteResponseSessionStore` share the same test contract, ensuring behavioral parity.

**E2E tests**: Start a real Godex server on a dynamic port with a mocked upstream provider, then exercise the full request lifecycle including streaming.

## Coverage

Coverage is tracked via [Codecov](https://codecov.io/gh/Ahoo-Wang/Godex).

[CI/CD & Publishing](/09-deployment/ci-cd)
