---
layout: home

hero:
  name: Godex
  text: OpenAI Responses API Gateway
  tagline: Translate /v1/responses into upstream Chat Completions API calls, so any LLM provider can drive Codex.
  actions:
    - theme: brand
      text: Getting Started
      link: /01-getting-started/overview
    - theme: alt
      text: Architecture
      link: /02-architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/Godex

features:
  - icon: 🔄
    title: Protocol Translation
    details: Bridges the gap between the OpenAI Responses API and provider-specific Chat Completions APIs. Tools like Codex work out of the box.
  - icon: 🔌
    title: Provider-agnostic
    details: A plugin-based adapter system means adding a new provider requires implementing a small set of interfaces, not rewriting the server.
  - icon: ⚡
    title: Streaming-first
    details: Built around ReadableStream and TransformStream for low-latency SSE delivery. Three-stage transformer pipeline with automatic session persistence.
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
