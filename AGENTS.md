# AGENTS.md — GodeX

AI coding agent instructions for the GodeX project.

## Build & Run Commands

```bash
bun install                  # Install dependencies
bun run dev                  # Dev server with hot reload (port 13145)
bun run start                # Start server without hot reload
bun run build                # Build standalone binary for current platform
bun run compile:all          # Cross-compile all 6 platforms
```

## Testing

```bash
bun test <pattern>           # Run specific test(s)
bun run test                 # Unit + integration tests (excludes src/e2e)
bun run test:e2e             # E2E tests with mocked upstream
bun run test:zhipu           # Live Zhipu integration (needs ZHIPU_API_KEY + ZHIPU_LIVE_TESTS=1)
bun run test:coverage        # Tests with coverage
```

## Code Quality

```bash
bun run typecheck            # tsc --noEmit
bun run lint                 # Biome check
bun run lint:fix             # Biome auto-fix
bun run format               # Biome format
bun run check                # typecheck + lint + test
bun run ci                   # Full CI: typecheck + biome ci + test + e2e
```

## Project Structure

```
src/
├── cli/              Commander CLI (serve, config, init)
├── config/           godex.yaml schema, env interpolation, defaults
├── context/          ApplicationContext (DI), ResponsesContext (per-request)
├── adapter/          Adapter interface, DefaultAdapter, stream transformers
│   ├── mapper/       RequestMapper/ResponseMapper/StreamMapper contracts, StreamState
│   └── transformers/ ProviderEvent→Response→SSE encode pipeline
├── providers/        Provider registry + builtin factories
│   └── zhipu/        Reference provider implementation
├── resolver/         ModelResolver (model selector → provider + model)
├── server/           Bun HTTP server, routes (/v1/responses, /health, /v1/models)
├── session/          ResponseSessionStore (Memory + SQLite), chain resolution
├── error/            GodeXError hierarchy with domain codes
├── protocol/openai/  OpenAI Responses API type definitions
├── providers/zhipu/protocol/  Zhipu-specific type definitions
├── logger/           Structured JSON logger
└── e2e/              End-to-end tests with mocked upstream
```

## Code Style

- **Language**: TypeScript (strict mode), ESNext target
- **Runtime**: Bun (uses Bun.serve, bun:sqlite, bun test runner)
- **Formatter**: Biome with tab indentation
- **Linter**: Biome with recommended rules
- **Imports**: ESM (`"type": "module"`), `verbatimModuleSyntax`
- **Naming**: camelCase for variables/functions, PascalCase for classes/interfaces/types
- **Error handling**: Use the GodeXError hierarchy (ServerError, AdapterError, ProviderError, SessionError) with domain codes from src/error/codes.ts
- **No comments** unless explaining WHY (not WHAT)

## Architecture

GodeX translates OpenAI Responses API requests into upstream Chat Completions API calls.

Request flow: CLI → ApplicationContext → Bun HTTP server → POST /v1/responses → ResponsesContext.create() → ModelResolver → Session chain → Registrar → DefaultAdapter → ProviderMapper → ChatClient → Upstream

Key abstractions:
- **Provider**: bundles mapper + chatClient + capabilities
- **ProviderMapper**: request/response/stream mapping functions
- **ChatClient**: HTTP boundary to upstream providers
- **Adapter**: orchestrates mapper + chatClient + session persistence
- **ModelResolver**: parses "provider/model" selectors with model name mappings
- **Registrar**: registry of ProviderFactory functions

## Git Workflow

- Main branch: `main`
- CI runs on push to main and PRs to main
- Live Zhipu tests only on push to main (not PRs)

## Boundaries

✅ Always:
- Run `bun run check` before committing
- Use Bun APIs (Bun.serve, bun:sqlite) over Node equivalents
- Follow the existing error hierarchy pattern
- Write tests for new functionality
- Use the `@ahoo-wang/fetcher` ecosystem for HTTP clients

⚠️ Ask first:
- Adding new provider implementations
- Modifying the Adapter or Provider interfaces
- Changing the config schema
- Modifying stream pipeline transformers

🚫 Never:
- Bypass the GodeXError hierarchy with raw Error throws in adapter/provider code
- Use Node.js-specific APIs when Bun equivalents exist
- Add external test frameworks (use Bun's built-in test runner)
- Modify generated wiki content in wiki/ without understanding VitePress structure
