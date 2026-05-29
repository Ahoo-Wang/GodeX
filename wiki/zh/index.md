---
layout: home
title: GodeX
description: OpenAI 兼容的 Responses API 网关，让 Codex、CLI 工具和开发者 Agent 接入任意模型。
head:
  - - meta
    - name: keywords
      content: GodeX, OpenAI, Responses API, 网关, Codex, CLI, LLM, 代理, Chat Completions, 提供商, 流式, SSE

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
    - theme: alt
      text: Gitee
      link: https://gitee.com/AhooWang/GodeX

features:
  - icon: 🧭
    title: 智能兼容性规划
    details: 每个请求参数、工具类型和输出格式都根据提供商声明的能力进行规划。不支持的特性会被优雅降级或拒绝，并附带结构化诊断信息 — 绝不静默丢弃。
  - icon: 🔧
    title: 丰富的工具身份映射
    details: Codex 内置工具（shell、apply_patch、local_shell）和提供商原生工具（web_search、file_search、mcp）通过身份编解码器自动映射，支持降级回退。工具调用在响应中恢复为原始类型。
  - icon: ⚡
    title: 严谨的流式状态机
    details: 流式响应由严格的阶段状态机驱动（IDLE → IN_PROGRESS → 终态），自动关闭输出块、校验阶段转换、在每个事件上生成实时快照 — 即使在提供商故障时也能确保稳健的 SSE 交付。
  - icon: 📐
    title: 输出契约与 Schema 降级
    details: 当提供商不支持 json_schema 时，结构化输出请求会被自动降级。GodeX 注入 Schema 指令并验证响应，使 json_schema 在仅支持 json_object 的提供商上也能正常工作。
  - icon: 🔗
    title: 安全的会话链式解析
    details: 多轮对话通过父指针链重建，具备循环检测、深度限制和完成状态校验。历史分叉是一等公民 — 多个响应可以共享同一父节点。
  - icon: 🧩
    title: 声明式提供商规格
    details: 提供商完全由不可变规格描述 — 能力、访问器、工具编解码器和钩子。Bridge 内核处理所有兼容性、路由和重建逻辑。新提供商无需修改任何共享基础设施。
---

## 工作原理

```mermaid
flowchart LR
  subgraph Client["客户端"]
    Codex["Codex CLI"]
    SDK["OpenAI SDK"]
    IDE["IDE / 工具"]
  end

  subgraph GodeX["GodeX 网关"]
    B["Bridge 内核"]
    R["响应流状态机"]
    S["会话存储"]
  end

  subgraph Providers["提供商"]
    DS["DeepSeek"]
    ZP["智谱"]
    Custom["自定义"]
  end

  Client -- POST /v1/responses --> GodeX
  B -- 兼容性规划 --> R
  R -- 工具与输出契约 --> S
  GodeX -- POST /chat/completions --> Providers
  Providers -- SSE / JSON --> GodeX
  GodeX -- SSE / JSON --> Client
```

GodeX 位于你的工具和上游模型提供商之间。它接收 OpenAI Responses API 请求，通过 Bridge 内核和提供商规格将其转换为 Chat Completions API 调用，并流式返回结果 — 完整保留 Codex 所期望的协议语义。

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
