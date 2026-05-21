# AGENTS.md — Source Code

AI agent instructions for the Godex source code.

## Build & Test

```bash
bun install && bun run check    # Install + full check
bun test src/adapter/           # Test specific module
bun run test:e2e                # E2E with mocked upstream
```

## Architecture

This directory contains the core Godex gateway. Key modules:

| Module | Purpose |
|--------|---------|
| `cli/` | Commander CLI entry points |
| `config/` | godex.yaml loading and validation |
| `context/` | Application and per-request context objects |
| `adapter/` | Adapter pattern: interface + default implementation + transformers |
| `providers/` | Provider registry and implementations (zhipu/) |
| `resolver/` | Model name resolution |
| `server/` | Bun HTTP server and route handlers |
| `session/` | Response session storage (memory/SQLite) |
| `error/` | Structured error hierarchy |
| `protocol/` | OpenAI and provider type definitions |
| `logger/` | Structured JSON logger |

## Conventions

- TypeScript strict mode, ESNext, ESM modules
- Biome for linting/formatting (tab indentation)
- Bun test runner (no external frameworks)
- GodexError hierarchy for all domain errors

## Boundaries

✅ Always:
- Follow the Provider/ProviderMapper/ChatClient pattern for new providers
- Use domain error codes from `error/codes.ts`
- Write tests alongside source files (`*.test.ts`)

⚠️ Ask first:
- Changing interface signatures in `adapter/`
- Modifying the stream pipeline transformers
- Changing the config schema

🚫 Never:
- Import Node.js APIs when Bun equivalents exist
- Use external test frameworks
- Throw raw Error in provider/adapter code
