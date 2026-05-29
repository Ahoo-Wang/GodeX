# AGENTS.md — GodeX Wiki

This is the VitePress documentation site for GodeX.

## Build & Run

```bash
npm install          # Install VitePress and plugins
npm run dev          # Dev server with hot reload (default port 5173)
npm run build        # Build static site to .vitepress/dist/
npm run preview      # Preview the built site
```

## Structure

```text
wiki/
  index.md                  Landing page
  llms.txt                  LLM-friendly index
  llms-full.txt             Full inline content for LLMs
  .vitepress/config.ts      VitePress config, sidebar, theme
  .vitepress/theme/         Custom theme (dark, Inter + JetBrains Mono, medium-zoom)
  01-getting-started/       Getting Started section
  02-architecture/          Architecture deep dive
  03-bridge-kernel/         Bridge Kernel documentation
  04-provider-development/  Provider development guide
  05-streaming-pipeline/    Streaming pipeline docs
  06-session-management/    Session management docs
  07-configuration/         Configuration reference
  08-trace-observability/   Trace & observability docs
  09-error-handling/        Error handling docs
  onboarding/               Audience-tailored onboarding guides
  public/                   Static assets (logo.svg, etc.)
```

## Content Conventions

- Mermaid diagrams use dark-mode colors: fills `#2d333b`, borders `#6d5dfc`, text `#e6edf3`
- No `<br/>` in Mermaid labels — use `<br>` or line breaks instead
- Source citations: `[file:line](https://github.com/Ahoo-Wang/GodeX/blob/main/file#Lline)`
- VitePress frontmatter: `title` and `description` on every page
- Use `autonumber` in all `sequenceDiagram` blocks
- Tables over prose for structured information

## Boundaries

Always:
- Run `npm run build` before pushing to verify no build errors
- Keep sidebar in sync with `.vitepress/config.ts`

Never:
- Delete generated documentation pages without updating sidebar and llms.txt
- Modify theme without testing dark-mode rendering
- Add runtime dependencies beyond VitePress and its plugins
