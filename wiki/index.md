---
layout: home
title: GodeX — OpenAI Responses API Gateway
description: Make every model a Codex engine through an OpenAI-compatible Responses API gateway

hero:
  name: GodeX
  text: Make every model a Codex engine
  tagline: OpenAI-compatible Responses API gateway for any LLM provider
  image:
    src: /logo.svg
    alt: GodeX
  actions:
    - theme: brand
      text: Quick Start
      link: /01-getting-started/quick-start
    - theme: alt
      text: Architecture
      link: /02-architecture/architecture
    - theme: alt
      text: View on GitHub
      link: https://github.com/Ahoo-Wang/GodeX

features:
  - icon: 🔄
    title: Responses API Gateway
    details: Translates OpenAI /v1/responses into any provider's Chat Completions API. Codex, Cursor, and Windsurf work with any LLM — no code changes needed.
  - icon: 🧩
    title: Bridge Kernel
    details: Provider-agnostic compatibility engine that plans support, degradation, and rejection for every feature before building the request. Transparent multi-provider support.
  - icon: 🏷️
    title: Model Aliasing
    details: Map OpenAI model names (gpt-5.5, gpt-4o) to any provider/model (zhipu/glm-5.1, deepseek/chat) with wildcard and fallback resolution.
  - icon: 🔀
    title: Streaming Pipeline
    details: Composable TransformStream chain translates provider SSE deltas into OpenAI Responses stream events through a validated state machine.
  - icon: 💬
    title: Session Chains
    details: Multi-turn conversations via previous_response_id with cycle detection, depth limiting, and memory or SQLite persistence.
  - icon: 🔍
    title: Trace & Observability
    details: Async SQLite trace recorder with bounded queue, payload capture, token usage tracking, and zero-overhead when disabled.
  - icon: 🛡️
    title: Structured Errors
    details: GodeXError hierarchy with domain-specific codes for server, bridge, provider, and session errors. Structured logging throughout.
  - icon: 🧪
    title: Provider SDK
    details: Add new providers with a compact spec + hooks pattern. Declare capabilities, implement accessors, and register via the built-in factory.
---
