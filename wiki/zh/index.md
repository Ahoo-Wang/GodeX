---
layout: home

hero:
  name: GodeX
  text: 让每个模型都成为 Codex 引擎。
  tagline: OpenAI 兼容的 Responses API 网关，让 Codex、CLI 工具和开发者 Agent 接入任意模型。
  image:
    src: /godex-logo-hero.svg
    alt: GodeX Logo
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/01-getting-started/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/GodeX

features:
  - icon: 🔄
    title: 协议转换
    details: 弥补 OpenAI Responses API 与提供商 Chat Completions API 之间的差距。Codex 和 OpenAI SDK 工具开箱即用。
  - icon: 🔌
    title: 提供商无关
    details: 基于插件的适配器系统。添加新提供商只需实现少量接口，无需重写服务器。
  - icon: ⚡
    title: 流式优先
    details: 基于 ReadableStream 和 TransformStream 构建，确保低延迟 SSE 传输。三阶段转换器管道，自动会话持久化。
  - icon: 💾
    title: 会话历史
    details: 内置 previous_response_id 链式解析，支持 SQLite 或内存后端。自动循环检测和深度限制。
  - icon: 🛡️
    title: 结构化错误
    details: 域特定错误层次结构，带结构化代码。每个错误都携带诊断和日志上下文。
  - icon: 📦
    title: 独立二进制
    details: 以原生二进制发布，零运行时依赖。通过 GitHub Actions CI/CD 构建六个平台。
---

## 工作原理

```
Codex / CLI / IDE
      │
      ▼  POST /v1/responses
┌─────────────────┐
│   GodeX 网关    │
└────────┬────────┘
         │  提供商适配器
         ▼
┌─────────────────────────┐
│  Chat Completions API   │
│  (任意兼容模型)          │
└─────────────────────────┘
```

GodeX 位于你的工具和上游模型提供商之间。它接收 OpenAI Responses API 请求，通过可插拔的提供商适配器将其转换为 Chat Completions API 调用，并流式返回结果 — 完整保留 Codex 所期望的协议语义。

## 快速开始

```bash
# 安装 — 运行时无需 Bun
npm install -g @ahoo-wang/godex

# 交互式创建配置
godex init

# 启动网关
godex serve
```

将 Codex CLI 指向你的 GodeX 实例：

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value
codex
```

---

::: info
阅读完整的[快速入门指南](/zh/01-getting-started/overview)或探索[架构概览](/zh/02-architecture/overview)。
:::
