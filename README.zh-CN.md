# Godex

OpenAI Responses API 网关 — 将 `/v1/responses` 请求转换为上游 Chat Completions API 调用，让**任何 LLM 提供商都能驱动 Codex**。

[![codecov](https://codecov.io/gh/Ahoo-Wang/Godex/graph/badge.svg?token=dJQrmUAiXu)](https://codecov.io/gh/Ahoo-Wang/Godex)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e0?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

## 架构

```mermaid
C4Context
  title Godex — 系统上下文

  Person(user, "开发者 / Codex CLI", "通过 OpenAI 兼容端点<br/>发送 Responses API 请求")
  System(godex_svr, "Godex 服务器", "转换 Responses API → Chat Completions API<br/>基于 Bun HTTP 服务器，端口可配置")
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

## 组件模型

```mermaid
classDiagram
  direction TB

  class ApplicationContext {
    +config: GodexConfig
    +logger: Logger
    +resolver: ModelResolver
    +registrar: Registrar
    +adapter: Adapter
    +sessionStore: ResponseSessionStore
  }

  class ResponsesContext {
    +app: ApplicationContext
    +request: ResponseCreateRequest
    +session: ResponseSessionSnapshot
    +resolved: ResolvedModel
    +provider: Provider
    +responseId: string
    +requestId: string
    +logger: Logger
    +create(app, body)$ Promise~ResponsesContext~
  }

  class ModelResolver {
    -defaultProvider: string
    -providerConfigs: Record
    +resolve(model) ResolvedModel
  }

  class Registrar {
    -factories: Map~string, ProviderFactory~
    +registerFactory(name, factory)
    +build(providers)
    +resolve(name) Provider
    +list() string[]
  }

  class Adapter {
    <<interface>>
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class DefaultAdapter {
    +request(ctx) Promise~ResponseObject~
    +stream(ctx) Promise~ReadableStream~
  }

  class Provider {
    <<interface>>
    +name: string
    +mapper: ProviderMapper
    +chatClient: ChatClient
    +capabilities: ProviderCapabilities
  }

  class ProviderMapper {
    <<interface>>
    +request: RequestMapper
    +response: ResponseMapper
    +stream: StreamMapper
  }

  class ChatClient {
    <<interface>>
    +chat(req) Promise~TRes~
    +streamChat(req) Promise~ReadableStream~
  }

  class RequestMapper {
    <<interface>>
    +map(ctx) TReq
  }

  class ResponseMapper {
    <<interface>>
    +map(ctx, result) ResponseObject
  }

  class StreamMapper {
    <<interface>>
    +map(ctx, event) ResponseStreamEvent[]
    +buildResponseObject(ctx, state) ResponseObject
  }

  class ResponseSessionStore {
    <<interface>>
    +get(id) StoredResponseSession
    +save(session, opts)
    +resolveChain(id, opts) ResponseSessionSnapshot
    +delete(id)
    +close()
  }

  class Router {
    -routes: Route[]
    +register(route)
    +dispatch(req) Promise~Response~
  }

  ApplicationContext --> ResponsesContext : 创建
  ApplicationContext --> ModelResolver
  ApplicationContext --> Registrar
  ApplicationContext --> Adapter
  ApplicationContext --> ResponseSessionStore
  ResponsesContext --> Provider : 使用
  Provider --> ProviderMapper
  Provider --> ChatClient
  ProviderMapper --> RequestMapper
  ProviderMapper --> ResponseMapper
  ProviderMapper --> StreamMapper
  Adapter <|.. DefaultAdapter
  DefaultAdapter --> ProviderMapper : 调用
  DefaultAdapter --> ChatClient : 调用
  DefaultAdapter --> ResponseSessionStore : 保存
  Router --> ResponsesContext : 分发至
```

## 流式管道

```mermaid
flowchart LR
  subgraph upstream["上游提供商"]
    SSE["SSE 数据块<br/>(JsonServerSentEvent)"]
  end

  subgraph godex["Godex 流式管道"]
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

### Transformer 职责

| 阶段 | Transformer | 输入 | 输出 | 副作用 |
|------|------------|------|------|--------|
| 1 | `ProviderEventToResponseTransformer` | `JsonServerSentEvent<TChunk>` | `ResponseStreamEvent` | 逐事件调用 `StreamMapper.map()` |
| 2 | `ResponseSessionPersistenceTransformer` | `ResponseStreamEvent` | `ResponseStreamEvent` | 累积 `StreamState`，终止事件时调用 `buildResponseObject()` 并保存会话（`store=false` 时跳过） |
| 3 | `ResponseSseEncodeTransformer` | `ResponseStreamEvent` | `Uint8Array`（SSE 传输格式） | 序列化为 `event:` / `data:` 行 |

## 错误体系

```mermaid
classDiagram
  direction TB

  class GodexError {
    +name: string
    +code: string
    +status: number
    +context: object
    +toLogEntry() object
  }

  class ServerError {
    +status: 400-499
    +context: object
  }

  class AdapterError {
    +status: 400-499
    +context: 不支持的参数 / 工具 / 输入项
  }

  class ProviderError {
    +status: 502
    +context: 上游状态码 / 响应体 / 响应头
  }

  class SessionError {
    +status: 400-409
    +context: 链元数据
  }

  GodexError <|-- ServerError
  GodexError <|-- AdapterError
  GodexError <|-- ProviderError
  GodexError <|-- SessionError

  note for GodexError "基础错误，支持结构化日志。<br/>所有错误携带领域编码（如 server.request.invalid_json）。"
  note for ProviderError "包装上游 HTTP 失败：<br/>速率限制、超时、5xx。"
  note for SessionError "链式解析失败：<br/>未找到、循环、深度超限。"
```

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
├── error/            GodexError 错误体系及领域编码
├── protocol/openai/  OpenAI 兼容类型定义
├── logger/           结构化 JSON 日志
└── e2e/              模拟上游的端到端测试
```

## 快速开始

```bash
# 安装依赖
bun install

# 构建独立二进制文件（当前平台）
bun run build

# 交互式创建配置
bun run start -- init

# 启动服务器（默认端口 5678）
bun run dev

# 或直接运行编译后的二进制文件
./platforms/darwin-arm64/bin/godex serve
```

### godex.yaml

```yaml
server:
  port: 5678

default_provider: zhipu

providers:
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/paas/v4
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

## 使用

```bash
# 安装 — 运行时无需 Bun
npm install -g @ahoo-wang/godex

# 交互式创建配置
godex init

# 启动网关
godex serve
```

Godex 以**独立原生二进制文件**发布，零运行时依赖。npm 的 `postinstall` 脚本自动为您的平台选择正确的二进制文件。唯一前置条件是 Node.js >= 18（仅在 `npm install` 期间需要）。

Godex 在 `http://localhost:5678` 暴露**与 OpenAI 兼容的 Responses API**（端口可配置）。将任何使用 OpenAI 协议的工具指向此端点即可：

### 搭配 Codex CLI

```bash
export OPENAI_BASE_URL=http://localhost:5678/v1
export OPENAI_API_KEY=any-value          # Godex 不验证此值，但必须设置
codex
```

### 搭配 OpenAI SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:5678/v1",
  apiKey: "any-value",      // 透传，不验证
});

const response = await client.responses.create({
  model: "gpt-4o",          // 通过 godex.yaml 的 models 表映射为 glm-4.7
  input: "Hello!",
});
```

### 模型选择

```
model: "gpt-4o"              → 通过 default_provider 的模型映射解析
model: "zhipu/glm-4.7"       → 显式指定 provider/model 选择器
model: "openai/gpt-4o"       → 路由到已配置的 openai 提供商
```

`godex.yaml` 中的 `models` 映射表可将标准模型名称转换为提供商原生名称 — 客户端无需修改代码。

### 健康检查

```bash
curl http://localhost:5678/health
# {"status":"ok","providers":["zhipu"],"unsupported_providers":[]}
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

# 发布流程：
# 1. 将 GitHub 仓库设为公开，配置 NPM_TOKEN，然后推送发布提交。
# 2. 创建标签为 vX.Y.Z 的 GitHub Release。
# 3. Release 工作流构建所有平台二进制文件。
# 4. Release 工作流上传二进制压缩包和 SHA256SUMS 到 Release Assets。
# 5. Release 工作流先发布平台包，再发布 @ahoo-wang/godex。
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
