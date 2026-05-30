---
title: "安装与配置"
description: "安装 GodeX、创建配置文件并启动服务器。"
keywords: "GodeX, 安装, 配置, npm, 二进制, Docker"
---

# 安装与配置

## 前提条件

- **Bun** >= 1.0（开发环境）
- **Node.js** >= 18（仅 npm 安装发布包时需要）

## 从 npm 安装

```bash
npm install -g @ahoo-wang/godex
```

GodeX 以**独立原生二进制文件**发布，零运行时依赖。npm 的 `postinstall` 自动选择适合您平台的二进制文件。

## Docker

预构建的多架构镜像发布到 Docker Hub 和 GitHub Container Registry：

```bash
docker pull ahoowang/godex:latest
# 或
docker pull ghcr.io/ahoo-wang/godex:latest
```

使用配置文件运行：

```bash
docker run -d \
  --name godex \
  -p 5678:5678 \
  -e ZHIPU_API_KEY=your-key \
  -e DEEPSEEK_API_KEY=your-key \
  -e MINIMAX_API_KEY=your-key \
  -v ./godex.yaml:/etc/godex/godex.yaml:ro \
  -v godex-data:/data \
  ahoowang/godex:latest
```

镜像支持 `linux/amd64` 和 `linux/arm64`。

| 路径 | 说明 |
|------|------|
| `/etc/godex/godex.yaml` | 配置文件（默认） |
| `/data` | 数据目录（会话、Trace） |

默认端口：`5678`。

## 从源码构建

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
bun run build
```

编译后的二进制文件输出到 `platforms/<os>-<arch>/bin/godex`。

## 创建配置

```bash
# 交互式向导 — 生成 godex.yaml
godex init

# 或使用开发服务器
bun run start -- init
```

这将创建一个 `godex.yaml` 文件：

```yaml
server:
  port: 5678

default_provider: deepseek

models:
  aliases:
    "gpt-5.5": deepseek/deepseek-v4-pro
    "glm": zhipu/glm-5.1
    "*": deepseek/deepseek-v4-flash

providers:
  deepseek:
    spec: deepseek
    credentials:
      api_key: ${DEEPSEEK_API_KEY}
    endpoint:
      base_url: https://api.deepseek.com
  zhipu:
    spec: zhipu
    credentials:
      api_key: ${ZHIPU_API_KEY}
    endpoint:
      base_url: https://open.bigmodel.cn/api/coding/paas/v4
  minimax:
    spec: minimax
    credentials:
      api_key: ${MINIMAX_API_KEY}
    endpoint:
      base_url: https://api.minimaxi.com/v1

session:
  backend: sqlite
  sqlite:
    path: ./data/sessions.db

logging:
  level: info
```

## 启动服务器

```bash
# 生产环境
godex serve

# 开发环境（热重载，端口 13145）
bun run dev
```

## 验证

```bash
curl http://localhost:5678/health
# {"status":"ok","providers":["deepseek","zhipu","minimax"],"unsupported_providers":[]}
```

## 配合 Codex CLI 使用

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value
codex
```

[快速参考](/zh/01-getting-started/quick-reference)
