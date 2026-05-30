# AGENTS.md — GodeX Wiki

AI agent instructions for the GodeX VitePress wiki.

## Build & Run

```bash
cd wiki
pnpm install          # Install VitePress + dependencies
pnpm run dev          # Dev server (hot reload)
pnpm run build        # Build static site to .vitepress/dist/
pnpm run preview      # Preview built site
```

## Structure

```
wiki/
├── .vitepress/
│   ├── config.mts      # VitePress config with Mermaid plugin
│   └── theme/          # Custom dark theme + zoom handlers
├── public/             # Static assets (CNAME)
├── 01-getting-started/ # Setup, installation, quick reference
├── 02-architecture/    # System design, request flow, bridge kernel, stream pipeline
├── 03-provider-development/  # Provider interface, Zhipu reference, mapping
├── 04-session-management/    # Session store, chain resolution
├── 05-streaming-pipeline/    # Transformers, stream state
├── 06-error-handling/        # Error hierarchy, error codes
├── 07-configuration/         # Config schema, CLI commands
├── 08-testing/               # Testing guide
├── 09-deployment/            # CI/CD, publishing
├── 10-trace/                 # Trace recording, SQLite schema, payload capture
├── index.md                  # Landing page
├── llms.txt                  # LLM-friendly index
└── llms-full.txt             # Full inlined content
```

## Content Conventions

- **Mermaid diagrams**: Always use dark-mode colors (`#2d333b`, `#6d5dfc`, `#e6edf3`, `#161b22`, `#8b949e`)
- **Citations**: `[file_path:line](https://github.com/Ahoo-Wang/GodeX/blob/main/file_path#Lline)`
- **Frontmatter**: Every page needs `title` and `description`
- **Self-closing tags**: Use `<br>` not `<br>` in Mermaid blocks
- **Sequence diagrams**: Always include `autonumber`

## Terminology

- **Bridge kernel** (`src/bridge/`) — Provider-agnostic Responses-to-Chat translation layer. Never use "adapter" or "DefaultAdapter".
- **ProviderEdge** — The interface between the bridge and a provider implementation. Never use "Provider" (the old interface).
- **ProviderSpec** — Provider capability and accessor declaration. Never use "ProviderMapper".
- **BridgeError** — Error domain for bridge-layer failures. Never use "AdapterError".
- **ResponseStreamStateMachine** — Stream event state machine. Never use "StreamResponseState".

## Documentation Sources

- `wiki/llms.txt` — LLM-friendly link index
- `wiki/llms-full.txt` — Full page content inlined

## Boundaries

Always:
- Test Mermaid diagrams render correctly in dark mode
- Maintain consistent citation format
- Keep VitePress frontmatter on every page

Ask first:
- Modifying theme CSS or JavaScript
- Changing VitePress configuration
- Adding new sidebar sections

Never:
- Delete generated wiki pages without understanding the structure
- Modify theme zoom handlers without testing
- Add light-mode styles that break dark theme
- Remove Mermaid dark-mode CSS overrides
- Reference `src/adapter/`, `DefaultAdapter`, `ProviderMapper`, `RequestMapper`, `ResponseMapper`, `StreamMapper`, `AdapterError`, or `StreamResponseState` — these no longer exist
