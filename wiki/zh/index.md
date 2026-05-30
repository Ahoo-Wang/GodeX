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
  - icon: 🔌
    title: 即插即用，无缝替换
    details: 将 Codex 或任何 OpenAI SDK 指向 GodeX — 无需改代码。透明地将 Responses API 翻译为 Chat Completions，工具调用、流式输出和结构化输出按提供商能力自动适配。
  - icon: 🧭
    title: 智能特性桥接
    details: 每个请求根据提供商的真实能力进行规划。工具自动映射，输出格式自动适配，不支持的特性优雅降级并附带诊断信息 — 绝不静默丢弃。
  - icon: ⚡
    title: 原生流式网关
    details: SSE 流式传输由严谨的阶段状态机驱动。逐 token 交付、实时快照、稳健的错误恢复 — 即使提供商中途断流也不丢失数据。
  - icon: 🔗
    title: 多轮会话支持
    details: 原生支持 previous_response_id，具备分叉安全的链式解析、循环检测和可插拔存储后端（内存或 SQLite）。跨提供商多轮对话开箱即用。
  - icon: 🔍
    title: 内置可观测性
    details: 每个请求全链路追踪 — 提供商调用、Token 用量、兼容性决策和错误。异步批量写入 SQLite，可配置的 Payload 捕获。
  - icon: 📦
    title: 单二进制，零依赖
    details: 编译一次，到处运行。Docker 镜像不到 50MB，6 个平台的原生二进制，或通过 npm 安装。无需 Node.js、无需 Python、零运行时负担。
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

## 文档导航

| 章节 | 说明 | 入口 |
|------|------|------|
| [快速入门](/zh/01-getting-started/overview) | 概述、安装、配置、提供商 | [概述](/zh/01-getting-started/overview) |
| [架构](/zh/02-architecture/overview) | 请求流程、核心类型 | [系统总览](/zh/02-architecture/overview) |
| [提供商开发](/zh/03-provider-development/provider-interface) | 如何接入新 LLM 提供商 | [Provider 接口](/zh/03-provider-development/provider-interface) |
| [会话管理](/zh/04-session-management/session-store) | 多轮对话支持 | [会话存储](/zh/04-session-management/session-store) |
| [流式管道](/zh/05-streaming-pipeline/transformers) | 流式转换与状态管理 | [转换器](/zh/05-streaming-pipeline/transformers) |
| [错误处理](/zh/06-error-handling/error-codes) | 错误码参考 | [错误码](/zh/06-error-handling/error-codes) |
| [配置](/zh/07-configuration/config-schema) | godex.yaml 配置参考 | [配置 Schema](/zh/07-configuration/config-schema) |
| [测试](/zh/08-testing/testing-guide) | 单元、E2E、Live 测试 | [测试指南](/zh/08-testing/testing-guide) |
| [追踪](/zh/10-trace/trace-recording) | 请求追踪与可观测性 | [追踪记录](/zh/10-trace/trace-recording) |
| [部署](/zh/09-deployment/ci-cd) | Docker、原生二进制、CI/CD | [CI/CD 与发布](/zh/09-deployment/ci-cd) |
