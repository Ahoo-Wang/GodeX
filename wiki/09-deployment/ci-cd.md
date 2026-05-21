---
title: "CI/CD"
description: "Godex CI and release workflows: cross-compilation for 6 platforms, npm package structure, and automated publishing."
---

# CI/CD

Godex uses GitHub Actions for continuous integration and release automation. The build produces standalone native binaries via `bun build --compile` for 6 platform targets.

## CI Workflow

Defined in [.github/workflows/ci.yml](https://github.com/Ahoo-Wang/Godex/blob/main/.github/workflows/ci.yml).

Triggers: push to `main`, PRs to `main`, manual dispatch.

### Jobs

| Job | Runner | Purpose |
|---|---|---|
| `check` | `ubuntu-latest` | Typecheck, lint, unit tests, E2E tests |
| `compile` | Platform matrix | Build native binary for each target |
| `zhipu-live` | `ubuntu-latest` | Live Zhipu tests (main only) |

```mermaid
flowchart TD
    A["Push / PR to main"] --> B["check"]
    A --> C["compile"]

    B --> B1["Set up Bun 1.3.14"]
    B1 --> B2["bun install --frozen-lockfile"]
    B2 --> B3["bun run ci"]

    C --> C1["6 platform targets"]
    C1 --> C2["bun run compile"]
    C2 --> C3["Upload binary artifact"]

    B --> D["zhipu-live"]
    D --> D1{"Not a PR?"}
    D1 -->|"yes"| D2["ZHIPU_API_KEY set?"]
    D2 -->|"yes"| D3["bun run test:zhipu"]
    D2 -->|"no"| D4["Skip"]
    D1 -->|"no"| D5["Skip"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style C fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## Cross-Compilation

The compile script ([scripts/compile.ts](https://github.com/Ahoo-Wang/Godex/blob/main/scripts/compile.ts)) uses `bun build --compile` for each platform:

```mermaid
flowchart LR
    A["src/index.ts"] --> B["bun build --compile<br/>--target=bun-darwin-arm64"]
    A --> C["bun build --compile<br/>--target=bun-darwin-x64"]
    A --> D["bun build --compile<br/>--target=bun-linux-x64"]
    A --> E["bun build --compile<br/>--target=bun-linux-arm64"]
    A --> F["bun build --compile<br/>--target=bun-windows-x64"]
    A --> G["bun build --compile<br/>--target=bun-windows-arm64"]

    B --> H["platforms/darwin-arm64/bin/godex"]
    C --> I["platforms/darwin-x64/bin/godex"]
    D --> J["platforms/linux-x64/bin/godex"]
    E --> K["platforms/linux-arm64/bin/godex"]
    F --> L["platforms/win32-x64/bin/godex.exe"]
    G --> M["platforms/win32-arm64/bin/godex.exe"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style H fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style I fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style J fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style K fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style L fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style M fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

| Target | Runner | Output |
|---|---|---|
| `darwin-arm64` | `macos-latest` | `platforms/darwin-arm64/bin/godex` |
| `darwin-x64` | `macos-13` | `platforms/darwin-x64/bin/godex` |
| `linux-x64` | `ubuntu-latest` | `platforms/linux-x64/bin/godex` |
| `linux-arm64` | `ubuntu-24.04-arm` | `platforms/linux-arm64/bin/godex` |
| `win32-x64` | `windows-latest` | `platforms/win32-x64/bin/godex.exe` |
| `win32-arm64` | `windows-11-arm` | `platforms/win32-arm64/bin/godex.exe` |

## Release Workflow

Defined in [.github/workflows/release.yml](https://github.com/Ahoo-Wang/Godex/blob/main/.github/workflows/release.yml).

Trigger: release published on GitHub.

```mermaid
sequenceDiagram
    autonumber
    participant Release as GitHub Release
    participant Checks as checks job
    participant Compile as compile job
    participant Publish as publish job
    participant npm as npm Registry
    participant GH as GitHub Assets

    Release->>Checks: Trigger
    Checks->>Checks: Verify repo is public
    Checks->>Checks: Verify NPM_TOKEN exists
    Checks->>Checks: Verify tag matches package version
    Checks->>Checks: bun run ci

    Checks->>Compile: needs: checks
    Compile->>Compile: Build 6 platform binaries
    Compile->>Compile: Upload artifacts

    Compile->>Publish: needs: compile
    Publish->>Publish: Download all artifacts
    Publish->>Publish: Place into platform dirs
    Publish->>GH: Upload tar.gz / zip + SHA256SUMS
    Publish->>Publish: Set version from tag
    Publish->>npm: Publish platform packages<br/>(@ahoo-wang/godex-darwin-arm64, etc.)
    Publish->>npm: Publish main package<br/>(@ahoo-wang/godex)
```

## npm Package Structure

The main package `@ahoo-wang/godex` acts as a wrapper. Platform-specific binaries are optional dependencies:

```json
{
  "name": "@ahoo-wang/godex",
  "optionalDependencies": {
    "@ahoo-wang/godex-darwin-arm64": "0.0.1",
    "@ahoo-wang/godex-darwin-x64": "0.0.1",
    "@ahoo-wang/godex-linux-x64": "0.0.1",
    "@ahoo-wang/godex-linux-arm64": "0.0.1",
    "@ahoo-wang/godex-win32-x64": "0.0.1",
    "@ahoo-wang/godex-win32-arm64": "0.0.1"
  }
}
```

A `postinstall` script ([scripts/install.cjs](https://github.com/Ahoo-Wang/Godex/blob/main/scripts/install.cjs)) selects the correct platform binary at install time.

### Publishing Flow

```mermaid
flowchart TD
    A["Release tag: vX.Y.Z"] --> B["Set version in all package.json files"]
    B --> C["Publish each platform package"]
    C --> D["Publish main @ahoo-wang/godex"]

    C --> C1["@ahoo-wang/godex-darwin-arm64"]
    C --> C2["@ahoo-wang/godex-darwin-x64"]
    C --> C3["@ahoo-wang/godex-linux-x64"]
    C --> C4["@ahoo-wang/godex-linux-arm64"]
    C --> C5["@ahoo-wang/godex-win32-x64"]
    C --> C6["@ahoo-wang/godex-win32-arm64"]

    style A fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style B fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style D fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

## References

- [.github/workflows/ci.yml](https://github.com/Ahoo-Wang/Godex/blob/main/.github/workflows/ci.yml) — CI workflow
- [.github/workflows/release.yml](https://github.com/Ahoo-Wang/Godex/blob/main/.github/workflows/release.yml) — Release workflow
- [scripts/compile.ts](https://github.com/Ahoo-Wang/Godex/blob/main/scripts/compile.ts) — Cross-compilation script
- [package.json](https://github.com/Ahoo-Wang/Godex/blob/main/package.json) — Package metadata and scripts
