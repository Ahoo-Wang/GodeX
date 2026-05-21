---
title: "Getting Started Overview"
description: "Prerequisites, installation methods, and your first request to the Godex Responses API gateway."
---

# Getting Started Overview

This guide covers the prerequisites, installation methods, and how to make your first request to Godex.

## Prerequisites

| Requirement | Minimum Version |
|---|---|
| **Bun** | >= 1.2 |
| **Node.js** | >= 18 (for npm install only) |
| **Zhipu API Key** | Required for the built-in provider |

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
```

## Installation

### Option A: Install from npm (recommended)

```bash
npm install -g @ahoo-wang/godex
```

### Option B: Build from source

```bash
git clone https://github.com/Ahoo-Wang/Godex.git
cd Godex
bun install
```

## Configuration and Startup

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant CLI as godex CLI
    participant Wizard as Init Wizard
    participant Config as godex.yaml
    participant Server as Bun Server

    User->>CLI: godex init
    CLI->>Wizard: Launch interactive wizard
    Wizard->>Wizard: Select provider
    Wizard->>Wizard: Enter API key
    Wizard->>Wizard: Choose port
    Wizard->>Wizard: Pick session backend
    Wizard->>Wizard: Set log level
    Wizard->>Config: Write godex.yaml
    Config-->>CLI: Done

    User->>CLI: godex serve
    CLI->>Config: Load configuration
    CLI->>Server: Start Bun.serve()
    Server-->>User: Listening on http://0.0.0.0:5678
```

After installing, create a configuration file:

```bash
godex init
```

Then start the server:

```bash
# Development with hot reload
bun run dev

# Production
godex serve
```

## First Request

```mermaid
sequenceDiagram
    autonumber
    participant Client as curl
    participant Godex as Godex Server
    participant Zhipu as Zhipu API

    Client->>Godex: POST /v1/responses<br/>{"model":"gpt-4o","input":"Hello"}
    Godex->>Godex: Resolve model: gpt-4o → zhipu/glm-4.7
    Godex->>Godex: Build Chat Completions request
    Godex->>Zhipu: POST /chat/completions<br/>{"model":"glm-4.7","messages":[...]}
    Zhipu-->>Godex: {"choices":[{"message":{"content":"Hi!"}}]}
    Godex->>Godex: Map to ResponseObject
    Godex-->>Client: {"id":"resp_...","status":"completed","output":[...]}
```

Send a non-streaming request:

```bash
curl -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "Say hello in one word."
  }'
```

Response:

```json
{
  "id": "resp_abc123",
  "object": "response",
  "created_at": 1716000000,
  "status": "completed",
  "model": "glm-4.7",
  "output": [
    {
      "id": "msg_abc123",
      "type": "message",
      "role": "assistant",
      "content": [{ "type": "output_text", "text": "Hello!" }]
    }
  ],
  "output_text": "Hello!"
}
```

## Streaming Request

```bash
curl -N -X POST http://localhost:5678/v1/responses \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "input": "Count to five",
    "stream": true
  }'
```

The response is a stream of SSE events:

```
event: response.created
data: {"type":"response.created","response":{"id":"resp_...","status":"in_progress",...}}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"1"}

event: response.output_text.delta
data: {"type":"response.output_text.delta","delta":"2"}

event: response.completed
data: {"type":"response.completed","response":{"status":"completed",...}}

data: [DONE]
```

## Verify It Works

```bash
# Health check
curl http://localhost:5678/health
```

Returns:

```json
{
  "status": "ok",
  "timestamp": 1716000000000,
  "providers": ["zhipu"],
  "unsupported_providers": []
}
```

## References

- [src/cli/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/cli/index.ts)
- [src/cli/serve.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/cli/serve.ts)
- [src/server/routes/responses/index.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/responses/index.ts)
- [src/server/routes/health.ts](https://github.com/Ahoo-Wang/Godex/blob/main/src/server/routes/health.ts)
