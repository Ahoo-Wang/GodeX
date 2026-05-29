---
title: "CLI Commands"
description: "Command-line interface reference for the godex binary."
keywords: "GodeX, CLI commands, serve, init, config"
---

# CLI Commands

GodeX ships as a single binary (`godex`) with three subcommands. `godex serve` is the default — running `godex` without arguments is equivalent to `godex serve`.

## `godex serve`

Start the gateway HTTP server.

```bash
godex serve                    # Start with default config
godex serve -c /path/to.yaml  # Use a custom config file
godex serve --port 8080       # Override port
godex serve --host 127.0.0.1  # Override bind address
godex serve --log-level debug # Override log level
```

Reads `godex.yaml` from the current directory (or the path specified by `-c`), initializes all components, and starts listening.

## `godex init`

Create a `godex.yaml` configuration file interactively.

```bash
godex init                     # Interactive wizard
godex init --config ~/.godex/config.yaml  # Specify output path
```

Prompts for:
- LLM providers to configure (DeepSeek, Zhipu, or both)
- Per-provider API key and base URL
- Default provider selection (when multiple providers are configured)
- Server port
- Session backend (SQLite or in-memory)
- Log level
- Config output path (home directory or working directory)

The generated config includes a wildcard model alias (`"*"`) pointing to the default provider's default model.

## `godex config check`

Validate the current configuration without starting the server.

```bash
godex config check
godex config check -c /path/to.yaml
```

Checks:
- YAML syntax validity
- Required fields presence
- Provider configuration completeness
- Model mapping format

## `godex config print`

Print the effective configuration with secrets redacted.

```bash
godex config print
```

Outputs the resolved config as JSON with API keys replaced by `***`.

## Build Commands (Development)

```bash
bun run dev          # Hot-reload dev server on port 13145
bun run build        # Compile native binary for current platform
bun run compile:all  # Cross-compile all 6 platform binaries
```

## Environment Variable Overrides

| Variable | Description |
|----------|-------------|
| `GODEX_PORT` | Override server port |
| `GODEX_HOST` | Override bind address |
| `GODEX_LOG_LEVEL` | Override log level |
| `GODEX_DEFAULT_PROVIDER` | Override default provider (falls back to `zhipu` if unset) |

[Testing Guide](/08-testing/testing-guide)
