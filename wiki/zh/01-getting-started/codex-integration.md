---
title: "Codex 集成"
description: "将 Codex 桌面应用接入 GodeX，在 config.toml 中配置自定义 provider。"
keywords: "GodeX, Codex, 集成, config.toml, 自定义 provider, Responses API"
---

# Codex 集成

将 Codex 桌面应用接入 GodeX，在 `~/.codex/config.toml` 中添加自定义 provider：

```toml
model = "gpt-5.5"
model_provider = "godex"

[model_providers.godex]
name = "GodeX"
base_url = "http://127.0.0.1:5678/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
```

## 工作原理

```
Codex 桌面应用
    │
    │  Responses API
    │  POST /v1/responses
    ▼
GodeX (localhost:5678)
    │
    │  Chat Completions API
    ▼
DeepSeek · 智谱 · MiniMax · Xiaomi MiMo
```

Codex 说 Responses 协议，GodeX 在中间翻译成各厂商的 Chat Completions 协议。对 Codex 来说，GodeX 就是一个普通的 OpenAI 兼容端点。

## 关键字段

| 字段 | 值 | 说明 |
|---|---|---|
| `model` | `"gpt-5.5"` | Codex 模型别名，由 GodeX `models.aliases` 解析 |
| `model_provider` | `"godex"` | 指向 `[model_providers.godex]` 配置块 |
| `base_url` | `"http://127.0.0.1:5678/v1"` | GodeX 服务地址 |
| `wire_api` | `"responses"` | 必须为 `"responses"`——GodeX 提供 Responses API |
| `requires_openai_auth` | `false` | GodeX 不需要 OpenAI 鉴权 |
| `supports_websockets` | `false` | GodeX 不支持 WebSocket 传输 |

## 可用的模型别名

GodeX 在 `godex.yaml` 中预置了以下 Codex 模型别名：

| Codex 模型 | 用途 | 路由到 |
|---|---|---|
| `gpt-5.5` | 默认主力：复杂编码、computer use、research | `deepseek/deepseek-v4-pro` |
| `gpt-5.4` | 旗舰：coding + reasoning + tool use | `deepseek/deepseek-v4-pro` |
| `gpt-5.4-mini` | 子任务调度 | `zhipu/glm-5.1` |
| `gpt-5.3-codex` | 编码专用：复杂软件工程 | `deepseek/deepseek-v4-pro` |
| `gpt-5.3-codex-spark` | 近实时编码迭代 | `zhipu/glm-5.1` |

模型别名到 provider/model 的映射完全在 `godex.yaml` 中管理，Codex 侧只需知道别名，切换 provider 无需改动客户端配置。

## 验证配置

### 健康检查

```bash
curl http://localhost:5678/health
```

### 模型列表

```bash
curl http://localhost:5678/v1/models
```

### 测试请求

```bash
curl http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-5.5","input":"你好，你是谁？"}'
```

## 推理努力

Codex 的 `model_reasoning_effort`（`low` / `medium` / `high` / `xhigh`）会被 GodeX 桥接为对应 provider 的 reasoning 参数：

| Provider | 行为 |
|---|---|
| DeepSeek | 原生 `reasoning_effort`，直接透传 |
| 智谱 | 布尔 `thinking` 开关，由 effort 级别映射 |
| MiniMax | 无 native reasoning，忽略 |
| Xiaomi MiMo | 布尔 `thinking` 开关，与智谱类似 |

GodeX 会在响应中附带兼容性诊断信息，告诉你哪些能力被降级或忽略。
