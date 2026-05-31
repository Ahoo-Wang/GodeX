---
title: "Codex Integration"
description: "Connect the Codex desktop app to GodeX by configuring a custom provider in config.toml."
keywords: "GodeX, Codex, integration, config.toml, custom provider, Responses API"
---

# Codex Integration

Connect the Codex desktop app to GodeX by adding a custom provider in `~/.codex/config.toml`:

```toml
model = "gpt-5.5"
model_provider = "godex"

[model_providers.godex]
name = "GodeX"
base_url = "http://127.0.0.1:5678/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
```

## How It Works

```
Codex desktop app
    │
    │  Responses API
    │  POST /v1/responses
    ▼
GodeX (localhost:5678)
    │
    │  Chat Completions API
    ▼
DeepSeek · Zhipu · MiniMax · Xiaomi MiMo
```

Codex speaks the OpenAI Responses protocol. GodeX sits in the middle and translates to each provider's Chat Completions protocol. To Codex, GodeX is an ordinary OpenAI-compatible endpoint.

## Key Fields

| Field | Value | Notes |
|---|---|---|
| `model` | `"gpt-5.5"` | Codex model alias; resolved by GodeX `models.aliases` |
| `model_provider` | `"godex"` | Points to the `[model_providers.godex]` block |
| `base_url` | `"http://127.0.0.1:5678/v1"` | GodeX server address |
| `wire_api` | `"responses"` | Must be `"responses"` — GodeX speaks Responses API |
| `requires_openai_auth` | `false` | GodeX does not require OpenAI authentication |
| `supports_websockets` | `false` | GodeX does not support WebSocket transport |

## Available Model Aliases

GodeX ships with these Codex model aliases in `godex.yaml`:

| Codex Model | Purpose | Routes To |
|---|---|---|
| `gpt-5.5` | Default: complex coding, computer use, research | `deepseek/deepseek-v4-pro` |
| `gpt-5.4` | Flagship: coding + reasoning + tool use | `deepseek/deepseek-v4-pro` |
| `gpt-5.4-mini` | Sub-agent tasks | `zhipu/glm-5.1` |
| `gpt-5.3-codex` | Codex coding: complex software engineering | `deepseek/deepseek-v4-pro` |
| `gpt-5.3-codex-spark` | Near-real-time coding iteration | `zhipu/glm-5.1` |

Model aliases are managed entirely in `godex.yaml`. Codex only needs the alias name — no client-side changes required when switching providers.

## Verification

### Health Check

```bash
curl http://localhost:5678/health
```

### List Models

```bash
curl http://localhost:5678/v1/models
```

### Test Request

```bash
curl http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-5.5","input":"Hello, who are you?"}'
```

## Reasoning Effort

Codex `model_reasoning_effort` (`low` / `medium` / `high` / `xhigh`) is bridged by GodeX per provider:

| Provider | Behavior |
|---|---|
| DeepSeek | Native `reasoning_effort`, passed through directly |
| Zhipu | Boolean `thinking` switch, mapped from effort level |
| MiniMax | No native reasoning, ignored |
| Xiaomi MiMo | Boolean `thinking` switch, similar to Zhipu |

GodeX includes compatibility diagnostics in responses, so you always know what was degraded or ignored.
