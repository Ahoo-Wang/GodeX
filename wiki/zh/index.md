---
layout: home

hero:
  name: Godex
  text: OpenAI Responses API 网关
  tagline: 将 /v1/responses 请求转换为上游 Chat Completions API 调用，使任何 LLM 提供商都能驱动 Codex。
  actions:
    - theme: brand
      text: 快速入门
      link: /zh/01-getting-started/overview
    - theme: alt
      text: 架构
      link: /zh/02-architecture/overview
    - theme: alt
      text: GitHub
      link: https://github.com/Ahoo-Wang/Godex

features:
  - icon: 🔄
    title: 协议转换
    details: 弥补 OpenAI Responses API 与提供商特定 Chat Completions API 之间的差距。Codex 等工具开箱即用。
  - icon: 🔌
    title: 提供商无关
    details: 基于插件的适配器系统，添加新提供商只需实现少量接口，无需重写服务器。
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
