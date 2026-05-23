---
title: "CLI Commands"
description: "Command-line interface reference for the godex binary."
keywords: "GodeX, CLI commands, serve, init, config"
---

# CLI Commands

GodeX ships as a single binary (`godex`) with three subcommands.

## `godex serve`

Start the gateway HTTP server.

```bash
godex serve                    # Start with default config
godex serve -c /path/to.yaml  # Use a custom config file
```

Reads `godex.yaml` from the current directory (or the path specified by `-c`), initializes all components, and starts listening.

## `godex init`

Create a `godex.yaml` configuration file interactively.

```bash
godex init
```

Prompts for:
- Server port
- Default provider
- Provider API key and base URL
- Model mappings
- Session backend (memory or SQLite)
- Log level

## `godex config check`

Validate the current configuration without starting the server.

```bash
godex config check
```

Checks:
- YAML syntax validity
- Required fields presence
- Provider configuration completeness
- Model mapping format

## Build Commands (Development)

```bash
bun run dev          # Hot-reload dev server on port 13145
bun run build        # Compile native binary for current platform
bun run compile:all  # Cross-compile all 6 platform binaries
```

[Testing Guide](/08-testing/testing-guide)
