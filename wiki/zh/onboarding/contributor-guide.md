---
title: "贡献者指南"
description: "为 GodeX 贡献代码的开发者实用指南。"
keywords: "GodeX, 贡献者, 开发, 快速开始"
---

# 贡献者指南

欢迎来到 GodeX。本指南带你从克隆到第一个贡献。

## 环境搭建

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
bun run check        # typecheck + lint + test
```

## 项目布局

```
src/
├── bridge/          与提供商无关的 Responses-to-Chat bridge 内核
│   ├── compatibility/  参数和响应格式规划
│   ├── request/        输入规范化和消息构建
│   ├── tools/          工具声明、tool_choice、身份映射
│   ├── output/         结构化输出合约规划和验证
│   ├── response/       同步 ResponseObject 重建
│   ├── stream/         流状态机和增量映射
│   ├── provider-spec/  ProviderSpec、ProviderEdge、工厂辅助
│   └── finish-reason/  提供商完成原因映射
├── providers/        提供商注册表、spec、hooks、客户端
│   ├── deepseek/      DeepSeek 提供商
│   ├── zhipu/         智谱提供商
│   ├── example/       仅 spec 的示例提供商
│   └── shared/        共享工具（ChatProviderClient、流增量映射器）
├── responses/        同步和流式编排管道
│   └── stream-transforms/  可组合 TransformStream 阶段
├── server/           Bun 路由（/health、/v1/models、/v1/responses）
├── context/          ApplicationContext 和每请求 ResponsesContext
├── resolver/         模型选择器和别名解析
├── session/          内存和 SQLite 会话存储
├── trace/            SQLite 追踪记录器
├── config/           godex.yaml 解析和验证
├── error/            GodeXError 层次与域代码
├── protocol/         OpenAI 协议类型定义
├── tools/            内置工具定义
├── cli/              Commander CLI
└── e2e/              使用模拟上游的端到端测试
```

## 关键概念

### Bridge 内核

Bridge 内核（`src/bridge/`）是与提供商无关的翻译层。它规划兼容性、构建 Chat Completions 请求并重建 Responses API 输出。不要在这里放置提供商特定逻辑。

### ProviderEdge

每个提供商实现 `ProviderEdge` — `ProviderSpec`（能力、访问器、hooks）和 HTTP 方法（`request`、`stream`）的组合。提供商特定逻辑属于 `src/providers/<name>/`。

### 流式管道

流式管道链接可组合的 `TransformStream` 阶段：追踪原始事件、通过状态机桥接增量、验证输出合约、追踪转换后事件、日志、持久化会话和日志诊断。

## 开发工作流

```bash
bun run dev           # 端口 13145 上的热重载开发服务器
bun run check         # typecheck + lint + test
bun run test:e2e      # 端到端测试
bun run test:coverage # 覆盖率报告
```

### 提交前

- 运行 `bun run check` — 必须通过。
- 如果更改了路由、提供商、会话、流或追踪行为，运行 `bun run test:e2e`。
- 为行为变更添加测试。

## 错误处理

使用 `src/error/` 中的 `GodeXError` 层次：

| 类 | 域 | 触发时机 |
|----|-----|---------|
| `ServerError` | `server` | 路由/请求/配置验证 |
| `BridgeError` | `bridge` | 兼容性、流状态、输出合约 |
| `ProviderError` | `provider` | 上游 HTTP/fetch 失败 |
| `SessionError` | `session` | 链和持久化错误 |

预期的运行时失败不要抛出原始 `Error`。

## 添加提供商

1. 创建 `src/providers/<name>/`，包含 `spec.ts`、`client.ts`、`hooks.ts` 和 `protocol/`。
2. 声明 `ProviderSpec`，包含能力、访问器和 hooks。
3. 使用 `ChatProviderClient` 创建 `ProviderEdge` 工厂。
4. 在 `src/providers/builtin.ts` 中注册。
5. 添加一致性测试。

[架构师指南](/zh/onboarding/staff-engineer-guide)
