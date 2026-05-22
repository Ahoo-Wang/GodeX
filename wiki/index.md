---
layout: home

hero:
  name: Godex
  text: OpenAI Responses API Gateway
  tagline: Translate /v1/responses into upstream Chat Completions API calls, so any LLM provider can drive Codex.
  actions:
    - theme: brand
      text: Getting Started
      link: /en/01-getting-started/overview
    - theme: alt
      text: Architecture
      link: /en/02-architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/Godex

features:
  - icon: 🔄
    title: Protocol Translation
    details: Bridges the gap between the OpenAI Responses API and provider-specific Chat Completions APIs.
  - icon: 🔌
    title: Provider-agnostic
    details: Plugin-based adapter system — add a new provider by implementing a small set of interfaces.
  - icon: ⚡
    title: Streaming-first
    details: Built around ReadableStream and TransformStream for low-latency SSE delivery.
  - icon: 💾
    title: Session History
    details: Built-in previous_response_id chain resolution with SQLite or in-memory backends.
---
