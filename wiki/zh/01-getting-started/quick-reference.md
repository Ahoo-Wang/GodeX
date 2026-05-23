---
title: "快速参考"
description: "常用命令、环境变量和 API 端点速查表。"
---

# 快速参考

## CLI 命令

| 命令 | 说明 |
|------|------|
| `godex serve` | 启动网关服务器 |
| `godex init` | 交互式创建 `godex.yaml` |
| `bun run dev` | 热重载开发服务器（端口 13145） |
| `bun run build` | 编译当前平台的原生二进制 |
| `bun run test` | 单元 + 集成测试 |
| `bun run test:e2e` | 带模拟上游的端到端测试 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | Biome 代码检查 |
| `bun run ci` | 完整 CI 流水线 |

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/v1/responses` | 创建响应（流式或非流式） |
| `GET` | `/v1/models` | 列出可用模型 |
| `GET` | `/health` | 健康检查 |

## 模型选择

```
model: "gpt-4o"         → 通过 default_provider 的模型映射解析
model: "zhipu/glm-4.7"  → 显式 provider/model 选择器
model: "openai/gpt-4o"  → 路由到配置的 openai 提供商
```

## 环境变量

| 变量 | 说明 |
|------|------|
| `ZHIPU_API_KEY` | 智谱提供商 API 密钥 |
| `OPENAI_BASE_URL` | 将 Codex CLI 指向 GodeX |
| `OPENAI_API_KEY` | 必须设置（GodeX 不验证） |

## OpenAI SDK 使用

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",
});

const response = await client.responses.create({
  model: "gpt-4o",
  input: "你好！",
});
```

[系统总览](/zh/02-architecture/overview)
