---
layout: home
title: GodeX
description: OpenAI-compatible Responses API gateway for Codex, CLI tools and developer agents. Translate /v1/responses into upstream Chat Completions API calls.
head:
  - - meta
    - name: keywords
      content: GodeX, OpenAI, Responses API, gateway, Codex, CLI, LLM, proxy, Chat Completions, provider, streaming, SSE

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
      link: /01-getting-started/quick-start
    - theme: alt
      text: Architecture
      link: /02-architecture/architecture
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/GodeX
    - theme: alt
      text: Gitee
      link: https://gitee.com/AhooWang/GodeX
features:
  - icon: 🔄
    title: Protocol Translation
    details: Bridges OpenAI Responses API and provider-specific Chat Completions APIs via a provider-agnostic bridge kernel. Codex and OpenAI SDK tools work out of the box.
  - icon: 🧩
    title: Bridge Kernel
    details: Compatibility planning engine that plans support, degradation, and rejection for every feature before building the request — enabling transparent multi-provider support.
  - icon: ⚡
    title: Streaming-first
    details: Composable TransformStream chain translates provider SSE deltas into OpenAI Responses stream events through a validated state machine. Low-latency delivery guaranteed.
  - icon: 🏷️
    title: Model Aliasing
    details: Map OpenAI model names (gpt-5.5, gpt-4o) to any provider/model with wildcard and fallback resolution. Point Codex at GodeX and it just works.
  - icon: 💬
    title: Session History
    details: Multi-turn conversations via previous_response_id with cycle detection, depth limiting, and memory or SQLite persistence backends.
  - icon: 🔍
    title: Trace & Observability
    details: Async SQLite trace recorder with bounded queue, payload capture, token usage tracking, and zero-overhead when disabled.
  - icon: 🛡️
    title: Structured Errors
    details: GodeXError hierarchy with domain-specific codes for server, bridge, provider, and session errors. Every error carries structured context for diagnostics.
  - icon: 📦
    title: Standalone Binary
    details: Ships as a native binary with zero runtime dependencies. Six platform builds via GitHub Actions CI/CD — install and run in seconds.
---

## How It Works

```
Codex / CLI / IDE
      │
      ▼  POST /v1/responses
┌─────────────────────┐
│   GodeX Gateway     │
│  ┌───────────────┐  │
│  │ Bridge Kernel │  │  Compatibility Planning → Request Building → Response Reconstruction
│  └───────────────┘  │
└────────┬────────────┘
         │  Provider Adapter
         ▼
┌─────────────────────────┐
│  Chat Completions API   │
│  DeepSeek · Zhipu · ... │
└─────────────────────────┘
```

GodeX sits between your tools and upstream model providers. It accepts OpenAI Responses API requests, translates them to Chat Completions API calls via the provider-agnostic bridge kernel, and streams results back — preserving the full protocol semantics that Codex expects.

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
Read the full [Getting Started guide](/01-getting-started/overview) or explore the [Architecture](/02-architecture/architecture).
:::
