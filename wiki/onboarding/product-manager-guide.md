---
title: "Product Manager Guide"
description: "Feature-focused overview for product managers — what GodeX does, what's possible, and where the boundaries are."
keywords: "GodeX, product manager guide, features, roadmap"
---

# Product Manager Guide

## What This System Does

GodeX is a **translator** between two AI API formats. Your team writes code using OpenAI's Responses API once, and GodeX automatically converts those requests to work with different AI providers (like DeepSeek, Zhipu GLM). Think of it as a universal bridge — plug in any AI model, and your existing tools (like Codex) just work.

## User Journey

```mermaid
graph LR
    DEV["Developer"] -->|"Configure godex.yaml"| GODEX["GodeX Gateway"]
    GODEX -->|"Route to provider"| PROVIDER["AI Provider"]
    PROVIDER -->|"Response"| GODEX
    GODEX -->|"OpenAI format"| DEV

    style DEV fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style GODEX fill:#161b22,stroke:#6d5dfc,color:#e6edf3
    style PROVIDER fill:#2d333b,stroke:#8b949e,color:#e6edf3
```

<!-- Sources: src/server/routes/responses/index.ts -->

## Feature Capability Map

| Feature | Status | User-Facing Behavior | Limitations |
|---------|--------|---------------------|-------------|
| Text generation | Live | Send messages, get AI responses | Depends on provider model |
| Streaming responses | Live | See responses appear in real-time | SSE only, no WebSocket |
| Multi-turn conversations | Live | Continue previous chats using `previous_response_id` | Session stored locally |
| Function/tool calling | Live | AI can call tools you define | Limited to provider-supported types |
| Model routing | Live | Use `"provider/model"` to pick provider and model | Must be pre-configured |
| Model aliases | Live | Map friendly names like `"gpt-4"` to actual models | Static config, no auto-discovery |
| Reasoning/thinking | Beta | See AI's reasoning process | Only if provider supports it |
| Structured output | Beta | Force AI to respond in JSON schema | Only if provider supports it |
| Web search | Not available | — | Planned |
| Image generation | Not available | — | Planned |

## Configuration & Setup

| Setting | What It Controls | Default | Who Can Change |
|---------|-----------------|---------|---------------|
| `server.port` | Which port the gateway listens on | `13145` | Operator (config file) |
| `default_provider` | Which AI provider to use when model name has no prefix | — | Operator (config file) |
| `providers.*.api_key` | Authentication key for each AI provider | — | Operator (env var or config) |
| `models.aliases` | Model name aliases and mappings | — | Operator (config file) |
| `session.backend` | Where conversation history is stored | `memory` | Operator (config file) |

## API Capabilities

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|---------------|
| `/v1/responses` | POST | Main AI request endpoint | None (local gateway) |
| `/v1/models` | GET | List available models | None |
| `/health` | GET | Check if gateway is running | None |

## Performance & SLAs

| Operation | Expected Latency | Notes |
|-----------|-----------------|-------|
| Non-streaming request | Upstream + ~5ms overhead | Gateway adds minimal latency |
| Streaming first token | Upstream time-to-first-token | Gateway is pass-through |
| Session chain resolution | <10ms | Local SQLite lookup |

## Known Limitations

| Limitation | User Impact | Workaround | Planned Fix |
|-----------|-------------|------------|-------------|
| Single provider out-of-the-box | Can only use Zhipu by default | Implement additional providers | Yes |
| No built-in authentication | Cannot restrict who uses the gateway | Deploy behind a reverse proxy with auth | Yes |
| No rate limiting | Gateway vulnerable to excessive requests | External rate limiter | Yes |
| Sessions lost on memory backend restart | Conversation history disappears | Use SQLite backend | By design |
| No admin UI | Configuration requires file editing | CLI commands for basic ops | Under consideration |

## Glossary

| Term | Plain Language |
|------|---------------|
| **Gateway** | A service that sits between your app and the AI provider, translating requests |
| **Provider** | An AI service (like Zhipu GLM) that actually generates responses |
| **Session** | A saved conversation that can be continued later |
| **Streaming** | Getting the AI's response piece by piece in real-time instead of waiting for the full answer |
| **Tool calling** | Letting the AI trigger actions (like searching a database) during a conversation |
| **Model** | A specific version of an AI (like "glm-4-plus") |
| **SSE** | Server-Sent Events — a way to stream data from server to client |

## FAQ

**Q: Do I need to change my OpenAI SDK code to use GodeX?**
A: No. Just point your OpenAI SDK's `baseURL` to GodeX and configure the provider in `godex.yaml`.

**Q: Can I use multiple AI providers at the same time?**
A: Yes. Use `"provider/model"` syntax in the model field to route to different providers.

**Q: What happens if the upstream AI provider goes down?**
A: GodeX returns a structured error with a provider-specific error code. It does not currently retry or failover to another provider.

**Q: Is my data sent anywhere besides the configured AI provider?**
A: No. GodeX is a pass-through gateway. Session data is stored locally in memory or SQLite.

**Q: Can I deploy GodeX in production?**
A: Yes. GodeX compiles to a standalone binary. You can run it on any server. For production, consider adding authentication and rate limiting via a reverse proxy.

**Q: How do I add a new AI provider?**
A: A developer needs to implement the Provider interface. See the [Contributor Guide](./contributor-guide.md) for details.

[Contributor Guide](./contributor-guide.md) · [Getting Started](/01-getting-started/overview)
