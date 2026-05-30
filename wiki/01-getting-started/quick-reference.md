---
title: "Quick Reference"
description: "Common commands, environment variables, and API endpoints."
keywords: "GodeX, quick reference, API, endpoints, models, health check"
---

# Quick Reference

## CLI Commands

| Command | Description |
|---------|-------------|
| `godex serve` | Start the gateway server |
| `godex init` | Create `godex.yaml` interactively |
| `bun run dev` | Hot-reload dev server on port 13145 |
| `bun run build` | Compile native binary for current platform |
| `bun run test` | Unit + integration tests |
| `bun run test:e2e` | End-to-end tests with mocked upstream |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Biome lint |
| `bun run ci` | Full CI pipeline |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/responses` | Create a response (streaming or non-streaming) |
| `GET` | `/v1/models` | List available models |
| `GET` | `/health` | Health check |

## Model Selection

```
model: "gpt-4o"         → resolved via default_provider model mapping
model: "zhipu/glm-4.7"  → explicit provider/model selector
model: "openai/gpt-4o"  → routes to configured openai provider
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DEEPSEEK_API_KEY` | API key for the DeepSeek provider |
| `ZHIPU_API_KEY` | API key for the Zhipu provider |
| `MINIMAX_API_KEY` | API key for the MiniMax provider |
| `OPENAI_BASE_URL` | Point Codex CLI at GodeX |
| `OPENAI_API_KEY` | Must be set (not validated by GodeX) |

## OpenAI SDK Usage

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",
});

const response = await client.responses.create({
  model: "gpt-4o",
  input: "Hello!",
});
```

[Architecture Overview](/02-architecture/overview)
