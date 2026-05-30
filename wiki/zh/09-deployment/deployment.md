---
title: 部署
description: 通过 Docker、原生编译二进制文件或 npm 包部署 GodeX -- 涵盖多阶段构建、交叉编译、平台特定分发、CI 管道和环境变量。
---

# 部署

GodeX 设计为零依赖部署：一个暴露 OpenAI 兼容 Responses API 网关的单一静态二进制文件。支持三种分发渠道——多阶段 Docker 镜像、六个平台目标的原生编译二进制文件，以及在安装时自动选择正确平台二进制文件的 npm 包。构建系统使用 Bun 的 `--compile` 标志生成自包含的可执行文件，Docker 镜像使用两阶段构建以保持运行时层最小化。

## 概览

| 方面 | 详情 |
|---|---|
| 运行时 | 独立二进制文件（Bun compile） |
| Docker | 多阶段：`oven/bun` 构建 + `debian:bookworm-slim` 运行时 |
| 平台 | darwin-arm64、darwin-x64、linux-x64、linux-arm64、win32-x64、win32-arm64 |
| 默认端口 | `GODEX_PORT=5678` |
| 配置路径 | `/etc/godex/godex.yaml`（Docker） |
| 数据卷 | `/data`（用于会话和追踪） |

## Docker 部署

```mermaid
graph TB
    subgraph build["Build Stage (oven/bun:1.3.14)"]
        style build fill:#161b22,stroke:#30363d,color:#e6edf3
        B1["bun install --frozen-lockfile"]
        B2["Inject VERSION into package.json"]
        B3["bun build --compile<br>--define GODEX_BUILD_ENV=prod"]
        B4["Output: /app/godex binary"]
        B1 --> B2 --> B3 --> B4
    end
    subgraph runtime["Runtime Stage (debian:bookworm-slim)"]
        style runtime fill:#161b22,stroke:#30363d,color:#e6edf3
        R1["COPY /app/godex -> /usr/local/bin/godex"]
        R2["mkdir /data (VOLUME)"]
        R3["mkdir /etc/godex (VOLUME)"]
        R4["EXPOSE 5678"]
        R5["ENTRYPOINT godex serve<br>--config /etc/godex/godex.yaml"]
        R1 --> R2 --> R3 --> R4 --> R5
    end
    B4 --> R1
```

Dockerfile 位于
[Dockerfile:1-53](https://github.com/Ahoo-Wang/GodeX/blob/main/Dockerfile#L1)，
使用两阶段构建：

### 构建阶段

| 步骤 | 描述 |
|---|---|
| 基础镜像 | `oven/bun:1.3.14` |
| 依赖安装 | `bun install --frozen-lockfile --ignore-scripts` |
| 版本注入 | 通过 `ARG VERSION` 使用 `sed` 替换 `package.json` 中的版本 |
| 编译 | `bun build --compile`，目标平台从 `TARGETARCH` 推导 |
| 定义 | `GODEX_BUILD_ENV="prod"` 内嵌到二进制文件中 |

`TARGETARCH` 构建参数在
[Dockerfile:22-28](https://github.com/Ahoo-Wang/GodeX/blob/main/Dockerfile#L22)
映射到 Bun 编译目标：`amd64` -> `x64`，`arm64` -> `arm64`。

### 运行时阶段

| 方面 | 值 |
|---|---|
| 基础镜像 | `debian:bookworm-slim` |
| 二进制文件位置 | `/usr/local/bin/godex` |
| 数据卷 | `/data`（会话、追踪） |
| 配置卷 | `/etc/godex` |
| 默认端口 | `5678`（环境变量 `GODEX_PORT`） |
| 入口点 | `godex serve --config /etc/godex/godex.yaml` |

### Docker 使用方法

```bash
# 构建
docker build --build-arg VERSION=1.0.0 -t godex .

# 运行
docker run -d \
  -p 5678:5678 \
  -v /path/to/godex.yaml:/etc/godex/godex.yaml \
  -v godex-data:/data \
  godex
```

## 原生二进制编译

```mermaid
flowchart LR
    subgraph compile["scripts/compile.ts"]
        style compile fill:#161b22,stroke:#30363d,color:#e6edf3
        A["bun run compile<br>(current platform)"]
        B["bun run compile --all<br>(all 6 platforms)"]
        C["bun run compile<br>--target=darwin-arm64"]
    end
    subgraph output["Output"]
        style output fill:#161b22,stroke:#30363d,color:#e6edf3
        D["platforms/darwin-arm64/bin/godex"]
        E["platforms/linux-x64/bin/godex"]
        F["platforms/win32-x64/bin/godex.exe"]
    end
    A --> D
    B --> D
    B --> E
    B --> F
```

编译脚本位于
[scripts/compile.ts:1-107](https://github.com/Ahoo-Wang/GodeX/blob/main/scripts/compile.ts#L1)，
支持三种模式：

| 模式 | 命令 | 目标 |
|---|---|---|
| 当前平台 | `bun run compile` | 匹配 `process.platform` + `process.arch` |
| 所有平台 | `bun run compile --all` | 所有六个平台 |
| 指定目标 | `bun run compile --target=darwin-arm64` | 单个平台 |

### 平台矩阵

定义在
[scripts/compile.ts:11-42](https://github.com/Ahoo-Wang/GodeX/blob/main/scripts/compile.ts#L11)：

| 平台 | npm 包 | Bun 目标 |
|---|---|---|
| macOS ARM64 | `@ahoo-wang/godex-darwin-arm64` | `bun-darwin-arm64` |
| macOS x64 | `@ahoo-wang/godex-darwin-x64` | `bun-darwin-x64` |
| Linux x64 | `@ahoo-wang/godex-linux-x64` | `bun-linux-x64` |
| Linux ARM64 | `@ahoo-wang/godex-linux-arm64` | `bun-linux-arm64` |
| Windows x64 | `@ahoo-wang/godex-win32-x64` | `bun-windows-x64` |
| Windows ARM64 | `@ahoo-wang/godex-win32-arm64` | `bun-windows-arm64` |

所有构建通过 `--define` 注入 `GODEX_BUILD_ENV="prod"`，位于
[第 83 行](https://github.com/Ahoo-Wang/GodeX/blob/main/scripts/compile.ts#L83)。

## npm 包分发

```mermaid
sequenceDiagram
    autonumber
    participant User
    participant npm as npm install @ahoo-wang/godex
    participant Main as Main Package
    participant PostInstall as scripts/install.cjs
    participant Platform as Platform Binary (optionalDep)

    User->>npm: install
    npm->>Main: resolve optionalDependencies
    npm->>Platform: install matching platform binary
    npm->>PostInstall: run postinstall
    PostInstall->>Platform: locate platform binary
    Platform-->>User: godex binary available
```

`package.json` 位于
[package.json:1-75](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L1)，
在
[第 49-55 行](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L49)
将平台特定二进制文件声明为 `optionalDependencies`：

```json
"optionalDependencies": {
  "@ahoo-wang/godex-darwin-arm64": "0.0.2",
  "@ahoo-wang/godex-darwin-x64": "0.0.2",
  "@ahoo-wang/godex-linux-x64": "0.0.2",
  "@ahoo-wang/godex-linux-arm64": "0.0.2",
  "@ahoo-wang/godex-win32-x64": "0.0.2",
  "@ahoo-wang/godex-win32-arm64": "0.0.2"
}
```

`postinstall` 脚本位于
[第 45 行](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L45)，
运行 `scripts/install.cjs` 来定位并链接正确的二进制文件。

## 环境变量

`EnvVars` 位于
[src/config/env.ts:15-30](https://github.com/Ahoo-Wang/GodeX/blob/main/src/config/env.ts#L15)，
从编译时 `GODEX_BUILD_ENV` 定义解析运行时环境：

| 变量 | 用途 | 值 |
|---|---|---|
| `GODEX_BUILD_ENV` | 编译时环境（内嵌到二进制文件中） | `prod`、`dev`（默认） |
| `GODEX_PORT` | 默认服务器端口（Docker） | 默认：`5678` |

`Env` 枚举位于
[src/config/env.ts:2-5](https://github.com/Ahoo-Wang/GodeX/blob/main/src/config/env.ts#L2)，
暴露 `EnvVars.isDev` 和 `EnvVars.isProd`，供整个代码库中的条件行为使用。

## CI 管道

`ci` 脚本位于
[package.json:42](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L42)，
运行完整的验证链：

```bash
bun run typecheck && biome ci src && bun run test && bun run test:e2e
```

| 步骤 | 命令 | 用途 |
|---|---|---|
| 类型检查 | `tsc --noEmit` | TypeScript 正确性 |
| 代码检查 | `biome ci src` | 代码风格强制 |
| 单元测试 | `bun test` | 除 E2E 外的所有测试 |
| E2E 测试 | `bun test src/e2e` | 端到端集成测试 |

`check` 脚本位于
[第 41 行](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json#L41)，
是推送前门控：`typecheck + lint + test`。

### E2E 测试目标

| 命令 | 提供商 | 实时标志 |
|---|---|---|
| `test:zhipu` | Zhipu（智谱） | `ZHIPU_LIVE_TESTS=1` |
| `test:deepseek` | DeepSeek | `DEEPSEEK_LIVE_TESTS=1` |
| `test:minimax` | MiniMax | `MINIMAX_LIVE_TESTS=1` |

## 交叉引用

- [CLI](../01-getting-started/cli.md) -- `godex serve` 和 `godex init` 命令
- [配置 Schema](../07-configuration/config-schema.md) -- godex.yaml 结构
- [服务器路由](../02-architecture/server-routes.md) -- 部署的服务器暴露的内容
- [CI/CD](./ci-cd.md) -- CI 管道详情

## 参考文献

- [Dockerfile](https://github.com/Ahoo-Wang/GodeX/blob/main/Dockerfile) -- 多阶段 Docker 构建
- [package.json](https://github.com/Ahoo-Wang/GodeX/blob/main/package.json) -- npm 包和脚本
- [scripts/compile.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/scripts/compile.ts) -- 原生二进制编译
- [src/config/env.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/config/env.ts) -- 环境变量解析
- [src/cli/serve.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/cli/serve.ts) -- serve 命令和关闭处理器
