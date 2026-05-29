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
      link: /01-getting-started/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/GodeX
    - theme: alt
      text: Gitee
      link: https://gitee.com/AhooWang/GodeX
features:
  - icon: 🧭
    title: Intelligent Compatibility Planning
    details: Every request parameter, tool type, and output format is planned against the provider's declared capabilities. Unsupported features are gracefully degraded or rejected with structured diagnostics — not silently dropped.
  - icon: 🔧
    title: Rich Tool Identity Mapping
    details: Codex built-in tools (shell, apply_patch, local_shell) and provider-native tools (web_search, file_search, mcp) are automatically mapped through identity codecs with degradation fallbacks. Tool calls are restored to their original types in responses.
  - icon: ⚡
    title: Formal Stream State Machine
    details: Streaming responses are driven by a rigorous phase-based state machine (IDLE → IN_PROGRESS → terminal) that auto-closes output blocks, validates transitions, and produces a live snapshot at every event — ensuring robust SSE delivery even on provider failures.
  - icon: 📐
    title: Output Contract with Schema Degradation
    details: Structured output requests are automatically downgraded when providers lack json_schema support. GodeX injects schema instructions and validates the response, so json_schema works even with providers that only support json_object.
  - icon: 🔗
    title: Safe Session Chain Resolution
    details: Multi-turn conversations are rebuilt from parent-pointer chains with cycle detection, depth limiting, and completion validation. History forking is first-class — multiple responses can share the same parent.
  - icon: 🧩
    title: Declarative Provider Spec
    details: Providers are fully described by immutable specs — capabilities, accessors, tool codecs, and hooks. The bridge kernel handles all compatibility, routing, and reconstruction. New providers need zero changes to shared infrastructure.
---

## How It Works

```mermaid
flowchart LR
  subgraph Client["Client"]
    Codex["Codex CLI"]
    SDK["OpenAI SDK"]
    IDE["IDE / Tools"]
  end

  subgraph GodeX["GodeX Gateway"]
    B["Bridge Kernel"]
    R["Response Stream State Machine"]
    S["Session Store"]
  end

  subgraph Providers["Providers"]
    DS["DeepSeek"]
    ZP["Zhipu"]
    Custom["Custom"]
  end

  Client -- POST /v1/responses --> GodeX
  B -- Compatibility Planning --> R
  R -- Tool & Output Contracts --> S
  GodeX -- POST /chat/completions --> Providers
  Providers -- SSE / JSON --> GodeX
  GodeX -- SSE / JSON --> Client
```

GodeX sits between your tools and upstream model providers. It accepts OpenAI Responses API requests, translates them to Chat Completions API calls via the bridge kernel and provider specs, and streams results back — preserving the full protocol semantics that Codex expects.

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
