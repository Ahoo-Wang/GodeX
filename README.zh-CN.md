<div align="center">

<img src="design/assets/01-logo-system/png/godex-logo-horizontal-transparent-800x233.png" alt="GodeX" width="480" />

**让每个模型都成为 Codex 引擎。**

OpenAI 兼容的 Responses API 网关 — 将 `/v1/responses` 请求转换为上游 Chat Completions API 调用，连接 Codex、CLI、IDE 和自动化开发工具与不同模型供应商。

[![codecov](https://codecov.io/gh/Ahoo-Wang/GodeX/graph/badge.svg?token=dJQrmUAiXu)](https://codecov.io/gh/Ahoo-Wang/GodeX)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e0?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

[快速入门](https://godex.ahoo.me/zh/01-getting-started/overview) · [架构](https://godex.ahoo.me/zh/02-architecture/overview) · [配置](https://godex.ahoo.me/zh/07-configuration/config-schema) · [API 参考](https://godex.ahoo.me/zh/01-getting-started/quick-reference) · [文档](https://godex.ahoo.me/zh/)

</div>

---

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
export OPENAI_API_KEY=any-value          # GodeX 不验证此值，但必须设置
codex
```

或使用 OpenAI SDK：

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",
});

const response = await client.responses.create({
  model: "gpt-4o",          // 通过 godex.yaml 的 models 表映射为 glm-4.7
  input: "Hello!",
});
```

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

## 架构

```mermaid
C4Context
  title GodeX — 系统上下文

  Person(user, "开发者 / Codex CLI", "通过 OpenAI 兼容端点<br/>发送 Responses API 请求")
  System(godex_svr, "GodeX 服务器", "转换 Responses API → Chat Completions API<br/>基于 Bun HTTP 服务器，端口可配置")
  SystemDb(sessions, "会话存储", "存储响应历史，用于<br/>previous_response_id 链式解析<br/>SQLite（持久化）或内存")
  System_Ext(zhipu, "智谱 (Zhipu)", "Chat Completions API 提供商")
  System_Ext(openai, "OpenAI", "Chat Completions API 提供商")
  System_Ext(other, "自定义提供商", "任何 Chat Completions<br/>兼容后端")

  Rel(user, godex_svr, "POST /v1/responses, GET /v1/models, GET /health", "HTTP/SSE")
  Rel(godex_svr, sessions, "保存 / 解析链")
  Rel(godex_svr, zhipu, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, openai, "POST /chat/completions", "HTTPS")
  Rel(godex_svr, other, "POST /chat/completions", "HTTPS")
```

## 请求流程

```mermaid
sequenceDiagram
  actor C as 客户端 (Codex CLI)
  participant R as Router 路由
  participant AC as ApplicationContext 应用上下文
  participant RC as ResponsesContext 响应上下文
  participant MR as ModelResolver 模型解析器
  participant SS as SessionStore 会话存储
  participant REG as Registrar 注册器
  participant A as Adapter 适配器 (DefaultAdapter)
  participant PM as ProviderMapper 提供商映射器
  participant CC as ChatClient 聊天客户端
  participant UP as 上游 API

  C->>R: POST /v1/responses
  R->>RC: ResponsesContext.create(app, body)

  activate RC
    RC->>MR: resolve(model)
    MR-->>RC: { provider, model }
    RC->>RC: 验证提供商配置

    opt previous_response_id
      RC->>SS: resolveChain(id)
      SS-->>RC: 会话快照
    end

    RC->>REG: resolve(provider)
    REG-->>RC: Provider 实例
  deactivate RC

  alt stream = true
    R->>A: adapter.stream(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: 上游请求
      A->>CC: streamChat(req)
      CC->>UP: POST (SSE)
      UP-->>CC: SSE 数据块
      CC-->>A: ReadableStream<SSE>
      A->>A: pipeTransform → ProviderEventToResponseTransformer
      A->>A: pipeTransform → ResponseSessionPersistenceTransformer
      A-->>R: ReadableStream<ResponseStreamEvent>
    deactivate A
    R->>R: pipeTransform → ResponseSseEncodeTransformer
    R-->>C: SSE 字节流
  else stream = false
    R->>A: adapter.request(ctx)
    activate A
      A->>PM: request.map(ctx)
      PM-->>A: 上游请求
      A->>CC: chat(req)
      CC->>UP: POST
      UP-->>CC: JSON 响应
      CC-->>A: 上游响应
      A->>PM: response.map(ctx, res)
      PM-->>A: ResponseObject
      A->>SS: save(session)
      A-->>R: ResponseObject
    deactivate A
    R-->>C: JSON 响应
  end
```

## 流式管道

```mermaid
flowchart LR
  subgraph upstream["上游提供商"]
    SSE["SSE 数据块<br/>(JsonServerSentEvent)"]
  end

  subgraph godex["GodeX 流式管道"]
    T1["ProviderEventTo<br/>ResponseTransformer"]
    T2["ResponseSession<br/>PersistenceTransformer"]
    T3["ResponseSse<br/>EncodeTransformer"]
  end

  subgraph client["客户端"]
    BYTES["SSE 字节流<br/>(text/event-stream)"]
  end

  SSE -->|"pipeThrough(TransformStream)"| T1
  T1 -->|"逐事件 map()<br/>SSE 数据块 → ResponseStreamEvent[]"| T2
  T2 -->|"累积 StreamState<br/>拦截终止事件<br/>buildResponseObject()<br/>保存会话"| T3
  T3 -->|"序列化为 SSE 传输格式<br/>event: xxx\ndata: {...}\n\n"| BYTES

  style upstream fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
  style godex fill:#0f3460,stroke:#16213e,color:#e0e0e0
  style client fill:#1a1a2e,stroke:#16213e,color:#e0e0e0
```

| 阶段 | Transformer | 输入 | 输出 | 副作用 |
|------|------------|------|------|--------|
| 1 | `ProviderEventToResponseTransformer` | `JsonServerSentEvent<TChunk>` | `ResponseStreamEvent` | 逐事件调用 `StreamMapper.map()` |
| 2 | `ResponseSessionPersistenceTransformer` | `ResponseStreamEvent` | `ResponseStreamEvent` | 累积 `StreamState`，终止事件时调用 `buildResponseObject()` 并保存会话 |
| 3 | `ResponseSseEncodeTransformer` | `ResponseStreamEvent` | `Uint8Array`（SSE 传输格式） | 序列化为 `event:` / `data:` 行 |

## 项目结构

```
src/
├── cli/              Commander CLI（serve、配置检查、初始化）
├── config/           godex.yaml 配置模式、环境变量插值、默认值
├── context/          ApplicationContext（DI 容器）、ResponsesContext（每请求）
├── adapter/          Adapter 接口、DefaultAdapter、流式 Transformer
│   ├── mapper/       RequestMapper / ResponseMapper / StreamMapper 契约
│   └── transformers/ ProviderEvent → Response → SSE 编码管道
├── providers/        Provider 注册表 + 内置工厂
│   └── zhipu/        参考提供商实现：映射器、聊天客户端、工具、消息
├── resolver/         ModelResolver（模型选择器 → 提供商 + 模型）
├── server/           Bun HTTP 服务器、Router、路由（/v1/responses、/health、/v1/models）
├── session/          ResponseSessionStore（内存 + SQLite）、链式解析
├── error/            GodeXError 错误体系及领域编码
├── protocol/openai/  OpenAI 兼容类型定义
├── logger/           结构化 JSON 日志
└── e2e/              模拟上游的端到端测试
```

## 配置

### godex.yaml

```yaml
server:
  port: 5678

default_provider: zhipu

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/coding/paas/v4
    models:
      "gpt-4o": glm-4.7         # 模型名称映射
      "*": glm-5.1              # 兜底映射

session:
  backend: sqlite               # 或 "memory"
  sqlite:
    path: ./data/sessions.db

logging:
  level: info                   # trace | debug | info | warn | error
```

### 模型选择

```
model: "gpt-4o"              → 通过 default_provider 的模型映射解析
model: "zhipu/glm-4.7"       → 显式指定 provider/model 选择器
model: "openai/gpt-4o"       → 路由到已配置的 openai 提供商
```

### 添加提供商

在 `src/providers/<name>/` 中实现以下接口：

| 接口 | 用途 |
|------|------|
| `Provider<TReq, TRes, TChunk>` | 组合 mapper + chatClient + capabilities |
| `ProviderMapper<TReq, TRes, TChunk>` | request / response / stream 映射函数 |
| `ChatClient<TReq, TRes, TChunk>` | `chat()` 和 `streamChat()` HTTP 调用 |

在 `src/providers/builtin.ts` 中注册工厂：

```ts
registrar.registerFactory("myprovider", (config) =>
  createMyProvider(config) as Provider<unknown, unknown, unknown>
);
```

## 命令

```bash
bun run dev          # 热重载开发服务器，端口 13145
bun run build        # 为当前平台编译原生二进制
bun run compile:all  # 本地交叉编译全部 6 个平台
bun run test         # 单元 + 集成测试
bun run test:e2e     # 模拟上游的端到端测试
bun run typecheck    # tsc --noEmit
bun run lint         # Biome 检查
bun run ci           # 完整 CI 流水线
```

## 发布

主包 `@ahoo-wang/godex` 是一个轻量外壳。原生二进制文件以平台特定的可选依赖发布：

```
@ahoo-wang/godex（包装包，0 运行时依赖）
├── engines: { node: ">=18.0.0" }    ← 仅用于 postinstall
├── postinstall: scripts/install.cjs   ← 检测平台，链接二进制文件
└── optionalDependencies:
    ├── @ahoo-wang/godex-darwin-arm64           ← macOS Apple Silicon
    ├── @ahoo-wang/godex-darwin-x64             ← macOS Intel
    ├── @ahoo-wang/godex-linux-x64              ← Linux x86_64
    ├── @ahoo-wang/godex-linux-arm64            ← Linux ARM64
    ├── @ahoo-wang/godex-win32-x64              ← Windows x86_64
    └── @ahoo-wang/godex-win32-arm64            ← Windows ARM64
```

## 许可证

[Apache License 2.0](LICENSE)
