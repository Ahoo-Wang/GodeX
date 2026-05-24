---
title: "Installation & Setup"
description: "Install GodeX, create configuration, and start the server."
keywords: "GodeX, installation, setup, npm, binary, configuration"
---

# Installation & Setup

## Prerequisites

- **Bun** >= 1.0 (for development)
- **Node.js** >= 18 (only needed for npm install of the published package)

## Install from npm

```bash
npm install -g @ahoo-wang/godex
```

GodeX ships as a **standalone native binary** with zero runtime dependencies. npm's `postinstall` automatically selects the correct binary for your platform.

## Build from Source

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
bun run build
```

The compiled binary is output to `platforms/<os>-<arch>/bin/godex`.

## Create Configuration

```bash
# Interactive wizard — generates godex.yaml
godex init

# Or with the dev server
bun run start -- init
```

This creates a `godex.yaml` in the current directory:

```yaml
server:
  port: 5678

default_provider: zhipu

models:
  aliases:
    "gpt-4o": zhipu/glm-4.7
    "*": zhipu/glm-5.1

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/coding/paas/v4

session:
  backend: sqlite
  sqlite:
    path: ./data/sessions.db

logging:
  level: info
```

## Start the Server

```bash
# Production
godex serve

# Development with hot reload (port 13145)
bun run dev
```

## Verify

```bash
curl http://localhost:5678/health
# {"status":"ok","providers":["zhipu"],"unsupported_providers":[]}
```

## Use with Codex CLI

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value
codex
```

## Platform Binaries

| Platform | Package |
|----------|---------|
| macOS Apple Silicon | `@ahoo-wang/godex-darwin-arm64` |
| macOS Intel | `@ahoo-wang/godex-darwin-x64` |
| Linux x86_64 | `@ahoo-wang/godex-linux-x64` |
| Linux ARM64 | `@ahoo-wang/godex-linux-arm64` |
| Windows x86_64 | `@ahoo-wang/godex-win32-x64` |
| Windows ARM64 | `@ahoo-wang/godex-win32-arm64` |

[Quick Reference](/01-getting-started/quick-reference)
