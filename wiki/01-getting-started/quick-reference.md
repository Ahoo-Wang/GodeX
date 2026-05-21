---
title: "Quick Reference"
description: "CLI commands, API endpoints, model selectors, environment variables, and common curl examples for Godex."
---

# Quick Reference

## CLI Commands

| Command | Description | Flags |
|---|---|---|
| `godex serve` | Start the Responses API proxy (default command) | `--port`, `--host`, `--config`, `--log-level` |
| `godex init` | Interactively create a `godex.yaml` configuration file | `--config` |
| `godex config check` | Validate config without starting the server | `--port`, `--host`, `--config`, `--log-level` |
| `godex config print` | Print effective config with secrets redacted | `--port`, `--host`, `--config`, `--log-level` |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check with provider status |
| `GET` | `/v1/models` | List available model aliases |
| `POST` | `/v1/responses` | Create a response (streaming or non-streaming) |

## Model Selector Syntax

The `model` field in a request accepts three forms:

| Selector | Resolved To | Example |
|---|---|---|
| `"provider/model"` | Explicit provider + model | `"zhipu/glm-4.7"` |
| `"model"` | Default provider + model (may be aliased) | `"gpt-4o"` → zhipu / `glm-4.7` |
| `"*"` (in config) | Wildcard fallback mapping | Any unmapped model → wildcard target |

Resolution logic from [src/resolver/index.ts:25](https://github.com/Ahoo-Wang/Godex/blob/main/src/resolver/index.ts#L25):

```
model selector → split on "/" → provider + raw name
  → lookup models[raw name] → if found, use mapped name
  → else lookup models["*"] → if found, use wildcard target
  → else use raw name as-is
```

## Minimal godex.yaml

```yaml
server:
  port: 5678

default_provider: zhipu

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/paas/v4

session:
  backend: memory

logging:
  level: info
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `ZHIPU_API_KEY` | — | Zhipu API key (referenced in config via `${ZHIPU_API_KEY}`) |
| `GODEX_PORT` | `5678` | Server port (overridden by CLI `--port` and config `server.port`) |
| `GODEX_HOST` | `0.0.0.0` | Server bind address (overridden by CLI `--host` and config `server.host`) |
| `GODEX_LOG_LEVEL` | `info` | Log level (overridden by CLI `--log-level` and config `logging.level`) |
| `GODEX_DEFAULT_PROVIDER` | `zhipu` | Default provider name |
| `NODE_ENV` | — | Set to `development` or `dev` for dev mode paths |

### Config Precedence

```
CLI flags > config file values > environment variables > built-in defaults
```

## Common curl Examples

### Create a Non-Streaming Response

```bash
curl -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "What is 2+2?"
  }'
```

### Create a Streaming Response

```bash
curl -N -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "Tell me a story",
    "stream": true
  }'
```

### Health Check

```bash
curl http://localhost:5678/health
```

Response:

```json
{
  "status": "ok",
  "timestamp": 1716000000000,
  "providers": ["zhipu"],
  "unsupported_providers": []
}
```

### List Available Models

```bash
curl http://localhost:5678/v1/models
```

Response:

```json
{
  "object": "list",
  "data": [
    { "id": "gpt-5.5", "object": "model", "owned_by": "zhipu" },
    { "id": "gpt-5", "object": "model", "owned_by": "zhipu" },
    { "id": "gpt-4o", "object": "model", "owned_by": "zhipu" }
  ]
}
```

### Multi-Turn Conversation (with previous_response_id)

```bash
# First turn
curl -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "My name is Alice"
  }'

# Second turn — reference the first response
curl -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "What is my name?",
    "previous_response_id": "resp_<ID_FROM_FIRST_RESPONSE>"
  }'
```

### Using Tools

```bash
curl -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "Search for latest news about AI",
    "tools": [{ "type": "web_search" }]
  }'
```

## References

- [src/cli/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/cli/index.ts) — CLI command definitions
- [src/config/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/config/index.ts) — Config loading and precedence
- [src/resolver/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/resolver/index.ts) — Model selector parsing
- [src/server/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/index.ts) — Route definitions
- [src/server/routes/health.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/health.ts) — Health endpoint
- [src/server/routes/models.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/models.ts) — Models endpoint
