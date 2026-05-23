---
title: "CI/CD & Publishing"
description: "GitHub Actions CI pipeline and multi-platform binary publishing workflow."
---

# CI/CD & Publishing

## CI Pipeline

The CI pipeline runs on every push and pull request via GitHub Actions:

1. **Typecheck** (`bun run typecheck`) — `tsc --noEmit`
2. **Lint** (`bun run lint`) — Biome check
3. **Unit tests** (`bun run test`)
4. **E2E tests** (`bun run test:e2e`)

## Publishing Flow

```mermaid
flowchart LR
  COMMIT["Release commit"]
  TAG["GitHub Release tag vX.Y.Z"]
  BUILD["Build 6 platform binaries"]
  UPLOAD["Upload to Release Assets"]
  PUBLISH["Publish to npm"]

  COMMIT --> TAG --> BUILD --> UPLOAD --> PUBLISH
```

### Platform Binaries

| Platform | Package |
|----------|---------|
| macOS Apple Silicon | `@ahoo-wang/godex-darwin-arm64` |
| macOS Intel | `@ahoo-wang/godex-darwin-x64` |
| Linux x86_64 | `@ahoo-wang/godex-linux-x64` |
| Linux ARM64 | `@ahoo-wang/godex-linux-arm64` |
| Windows x86_64 | `@ahoo-wang/godex-win32-x64` |
| Windows ARM64 | `@ahoo-wang/godex-win32-arm64` |

### Package Architecture

The main `@ahoo-wang/godex` npm package is a lightweight shell:
- `engines: { node: ">=18.0.0" }` — only needed during `postinstall`
- `postinstall: scripts/install.cjs` — detects platform, links binary
- `optionalDependencies` — platform-specific packages

The release workflow:
1. Makes the GitHub repository public, configures `NPM_TOKEN`, then pushes the release commit
2. Creates a GitHub Release tagged `vX.Y.Z`
3. Builds all platform binaries via the Release workflow
4. Uploads binary archives and SHA256 checksums to Release Assets
5. Publishes platform packages first, then `@ahoo-wang/godex`

[Back to Overview](/01-getting-started/overview)
