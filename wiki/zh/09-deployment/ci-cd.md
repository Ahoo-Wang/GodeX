---
title: "CI/CD 与发布"
description: "GitHub Actions CI 流水线和多平台二进制发布工作流。"
keywords: "GodeX, 部署, CI/CD, 发布, npm"
---

# CI/CD 与发布

## CI 流水线

CI 流水线通过 GitHub Actions 在每次推送和拉取请求时运行：

1. **类型检查**（`bun run typecheck`）— `tsc --noEmit`
2. **代码检查**（`bun run lint`）— Biome 检查
3. **单元测试**（`bun run test`）
4. **E2E 测试**（`bun run test:e2e`）

## 发布流程

```mermaid
flowchart LR
  COMMIT["发布提交"]
  TAG["GitHub Release 标签 vX.Y.Z"]
  BUILD["构建 6 个平台二进制"]
  UPLOAD["上传到 Release 资产"]
  PUBLISH["发布到 npm"]

  COMMIT --> TAG --> BUILD --> UPLOAD --> PUBLISH
```

### 平台二进制

| 平台 | 包名 |
|------|------|
| macOS Apple Silicon | `@ahoo-wang/godex-darwin-arm64` |
| macOS Intel | `@ahoo-wang/godex-darwin-x64` |
| Linux x86_64 | `@ahoo-wang/godex-linux-x64` |
| Linux ARM64 | `@ahoo-wang/godex-linux-arm64` |
| Windows x86_64 | `@ahoo-wang/godex-win32-x64` |
| Windows ARM64 | `@ahoo-wang/godex-win32-arm64` |

### 包架构

主 `@ahoo-wang/godex` npm 包是一个轻量外壳：
- `engines: { node: ">=18.0.0" }` — 仅在 `postinstall` 时需要
- `postinstall: scripts/install.cjs` — 检测平台，链接二进制
- `optionalDependencies` — 平台特定包

发布工作流：
1. 将 GitHub 仓库设为公开，配置 `NPM_TOKEN`，然后推送发布提交
2. 创建标记为 `vX.Y.Z` 的 GitHub Release
3. 通过 Release 工作流构建所有平台二进制
4. 上传二进制归档和 SHA256 校验和到 Release 资产
5. 先发布平台包，再发布 `@ahoo-wang/godex`

[返回概述](/zh/01-getting-started/overview)
