---
layout: home

hero:
  name: GodeX
  text: Make every model a Codex engine.
  tagline: OpenAI-compatible Responses API gateway for Codex, CLI tools and developer agents.
  image:
    src: /godex-logo-hero.svg
    alt: GodeX Logo
  actions:
    - theme: brand
      text: Getting Started
      link: /01-getting-started/overview
    - theme: alt
      text: View on GitHub
      link: https://github.com/Ahoo-Wang/GodeX

features:
  - icon: 🔄
    title: Protocol Translation
    details: Bridges OpenAI Responses API and provider-specific Chat Completions APIs. Codex and OpenAI SDK tools work out of the box.
  - icon: 🔌
    title: Provider-agnostic
    details: Plugin-based adapter system. Add a new provider by implementing a small set of interfaces — no server rewrite needed.
  - icon: ⚡
    title: Streaming-first
    details: Built on ReadableStream and TransformStream for low-latency SSE delivery. Three-stage transformer pipeline with automatic session persistence.
  - icon: 💾
    title: Session History
    details: Built-in previous_response_id chain resolution with SQLite or in-memory backends. Automatic cycle detection and depth limiting.
  - icon: 🛡️
    title: Structured Errors
    details: Domain-specific error hierarchy with structured codes. Every error carries context for diagnostics and logging.
  - icon: 📦
    title: Standalone Binary
    details: Ships as a native binary with zero runtime dependencies. Six platform builds via GitHub Actions CI/CD.
---

## How It Works

```
Codex / CLI / IDE
      │
      ▼  POST /v1/responses
┌─────────────────┐
│   GodeX Gateway │
└────────┬────────┘
         │  Provider Adapter
         ▼
┌─────────────────────────┐
│  Chat Completions API   │
│  (any compatible model) │
└─────────────────────────┘
```

GodeX sits between your tools and upstream model providers. It accepts OpenAI Responses API requests, translates them to Chat Completions API calls via pluggable provider adapters, and streams results back — preserving the full protocol semantics that Codex expects.

## Quick Start

```bash
# Install — no Bun required at runtime
npm install -g @ahoo-wang/godex

# Create config interactively
godex init

# Start the gateway
godex serve
```

Point Codex CLI at your GodeX instance:

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value
codex
```

---

::: info
Read the full [Getting Started guide](/01-getting-started/overview) or explore the [Architecture](/02-architecture/overview).
:::
