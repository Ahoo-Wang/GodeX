---
title: "测试指南"
description: "GodeX 中的单元测试、集成测试和端到端测试策略。"
keywords: "GodeX, 测试, 单元测试, e2e"
---

# 测试指南

GodeX 使用分层测试方法：针对单个模块的单元测试、针对组件交互的集成测试，以及带模拟上游服务器的端到端测试。

## 测试命令

```bash
bun run test         # 单元 + 集成测试
bun run test:e2e     # 带模拟上游的端到端测试
bun run ci           # 完整 CI 流水线（类型检查 + 代码检查 + 测试 + E2E）
```

## 测试结构

```
src/
├── bridge/
│   ├── compatibility/*.test.ts
│   ├── tools/*.test.ts
│   ├── output/*.test.ts
│   ├── request/*.test.ts
│   ├── response/*.test.ts
│   ├── stream/*.test.ts
│   ├── provider-spec/*.test.ts
│   └── finish-reason/*.test.ts
├── config/
│   ├── env.test.ts
│   └── loader.test.ts
├── context/
│   ├── application-context.test.ts
│   └── responses-context.test.ts
├── e2e/
│   ├── e2e.test.ts
│   └── zhipu-api.test.ts
├── error/*.test.ts
├── providers/
│   ├── registrar.test.ts
│   └── zhipu/*.test.ts
├── resolver/index.test.ts
├── server/*.test.ts
└── session/*.test.ts
```

## 测试模式

**模块边界测试**（`module-boundaries.test.ts`）：验证模块导入边界是否被遵守——禁止跨边界直接导入。

**会话存储测试**：`MemoryResponseSessionStore` 和 `SQLiteResponseSessionStore` 共享相同的测试契约，确保行为一致性。

**E2E 测试**：在动态端口上启动真实的 GodeX 服务器，配合模拟上游提供商，测试完整的请求生命周期（包括流式传输）。

## 覆盖率

覆盖率通过 [Codecov](https://codecov.io/gh/Ahoo-Wang/GodeX) 追踪。

[CI/CD 与发布](/zh/09-deployment/ci-cd)
