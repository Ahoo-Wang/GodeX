<div align="center">

<img src="design/assets/01-logo-system/png/godex-logo-horizontal-transparent-800x233.png" alt="GodeX" width="480" />

**让每个模型都成为 Codex 引擎。**

面向编码模型的 OpenAI 兼容 Responses API 网关，用一个本地服务连接 Codex、SDK、CLI、IDE 与 DeepSeek、智谱等 Chat Completions 上游。

[![npm version](https://img.shields.io/npm/v/@ahoo-wang/godex?logo=npm)](https://www.npmjs.com/package/@ahoo-wang/godex)
[![codecov](https://codecov.io/gh/Ahoo-Wang/GodeX/graph/badge.svg?token=dJQrmUAiXu)](https://codecov.io/gh/Ahoo-Wang/GodeX)
[![Bun](https://img.shields.io/badge/runtime-bun-f9f1e0?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/lang-typescript-3178c6?logo=typescript)](https://www.typescriptlang.org/)

</div>

GodeX 让使用 OpenAI Responses API 的客户端，可以通过一个本地网关调用 DeepSeek、智谱等只提供 Chat Completions API 的模型提供商。

## 功能特性

- OpenAI 兼容的 `POST /v1/responses`，支持同步和流式响应。
- `GET /v1/models` 暴露模型别名，让客户端使用稳定模型名，GodeX 负责路由到 provider/model。
- 内置 DeepSeek、智谱桥接 provider。
- 基于 provider capability 规划请求参数、工具、`tool_choice`、结构化输出、推理和流式 usage。
- 支持 `previous_response_id` 会话链，可使用内存或 SQLite。
- Trace 记录 provider request、provider response、stream event、usage 和 error。
- 基于 Bun 运行时、TypeScript 源码，并通过 release 产出多平台原生二进制。

## 架构图

```mermaid
flowchart TB
  Client["客户端<br>Codex, SDK, CLI, IDE"] --> Routes["Bun 路由<br>/health<br>/v1/models<br>/v1/responses"]
  Routes --> Ctx["ResponsesContext<br>request id, response id, resolved model,<br>provider, session, diagnostics"]

  Ctx --> Resolver["ModelResolver<br>别名与 provider/model 解析"]
  Ctx --> Session["ResponseSessionStore<br>内存或 SQLite<br>previous_response_id 链"]
  Ctx --> Registrar["Registrar<br>内置 ProviderEdge 工厂"]
  Ctx --> Runtime["ResponsesBridgeRuntime"]

  Runtime --> Sync["SyncRequestPipeline"]
  Runtime --> Stream["StreamPipeline"]
  Sync --> Exchange["ProviderExchange"]
  Stream --> Exchange

  Exchange --> Builder["bridge/request<br>buildChatCompletionRequest"]
  Builder --> Compat["bridge/compatibility<br>参数与 response-format 决策"]
  Builder --> Tools["bridge/tools<br>工具声明, tool_choice,<br>身份恢复"]
  Builder --> Output["bridge/output<br>结构化输出契约"]

  Exchange --> Edge["ProviderEdge<br>ProviderSpec + hooks"]
  Edge --> ClientHttp["ChatProviderClient<br>Fetcher HTTP 边界"]
  ClientHttp --> Upstream["Chat Completions 上游<br>DeepSeek, 智谱, 自定义"]

  Upstream --> SyncRecon["bridge/response<br>reconstructResponseObject"]
  Upstream --> StreamRecon["bridge/stream<br>ResponseStreamStateMachine"]
  SyncRecon --> ResponseJson["ResponseObject JSON"]
  StreamRecon --> StreamTransforms["stream transforms<br>validate, trace, log, persist, diagnostics"]
  StreamTransforms --> Sse["Responses SSE"]

  Ctx --> Trace["trace recorder<br>request, usage, event, error rows"]
  Ctx --> Logger["structured logger"]
```

## 组件交互图

```mermaid
sequenceDiagram
  autonumber
  actor Client as 客户端
  participant Server as /v1/responses route
  participant Context as ResponsesContext factory
  participant Resolver as ModelResolver
  participant Store as ResponseSessionStore
  participant Registrar
  participant Runtime as ResponsesBridgeRuntime
  participant Exchange as ProviderExchange
  participant Bridge as bridge/request
  participant Provider as ProviderEdge
  participant Upstream as Chat Completions API

  Client->>Server: POST /v1/responses
  Server->>Server: 解析并校验 JSON envelope
  Server->>Context: create(app, body)
  Context->>Resolver: resolve(body.model)
  Resolver-->>Context: provider + upstream model
  opt previous_response_id
    Context->>Store: resolveChain(previous_response_id)
    Store-->>Context: 有序 session snapshot
  end
  Context->>Registrar: resolve(provider)
  Registrar-->>Context: ProviderEdge
  Server->>Runtime: request(ctx) 或 stream(ctx)
  Runtime->>Exchange: 构建并发送 provider request
  Exchange->>Bridge: buildChatCompletionRequest(ctx)
  Bridge-->>Exchange: chat request + compatibility/tool/output plans
  Exchange->>Provider: request(body) 或 stream(body)
  Provider->>Upstream: POST /chat/completions
  Upstream-->>Provider: JSON response 或 SSE chunks
  alt sync
    Provider-->>Exchange: provider response
    Exchange-->>Runtime: provider response + plans
    Runtime->>Store: 保存 completed response，除非 store=false
    Runtime-->>Server: ResponseObject
    Server-->>Client: JSON
  else stream
    Provider-->>Exchange: provider SSE stream
    Exchange-->>Runtime: stream + plans
    Runtime->>Runtime: 桥接 delta、校验输出、trace、log、persist
    Runtime-->>Server: ResponseStreamEvent stream
    Server-->>Client: text/event-stream
  end
```

## 安装

本地开发：

```bash
git clone https://github.com/Ahoo-Wang/GodeX.git
cd GodeX
bun install
```

包安装：

```bash
npm install -g @ahoo-wang/godex
godex --help
```

### Docker

预构建镜像发布到 Docker Hub 和 GitHub Container Registry：

```bash
docker pull ahoowang/godex:latest
# 或
docker pull ghcr.io/ahoo-wang/godex:latest
```

使用配置文件运行：

```bash
docker run -d \
  --name godex \
  -p 5678:5678 \
  -e ZHIPU_API_KEY=your-key \
  -e DEEPSEEK_API_KEY=your-key \
  -v ./godex.yaml:/etc/godex/godex.yaml:ro \
  -v godex-data:/data \
  ahoowang/godex:latest
```

镜像支持 `linux/amd64` 和 `linux/arm64`。

- 配置文件路径：`/etc/godex/godex.yaml`
- 数据目录（会话、Trace）：`/data`
- 默认端口：`5678`

## 快速开始

交互式创建配置：

```bash
godex init
```

也可以手写 `godex.yaml`：

```yaml
server:
  port: 5678
  host: 0.0.0.0

default_provider: deepseek

models:
  aliases:
    gpt-5.5: deepseek/deepseek-v4-pro
    glm: zhipu/glm-5.1
    "*": deepseek/deepseek-v4-flash

providers:
  deepseek:
    spec: deepseek
    credentials:
      api_key: ${DEEPSEEK_API_KEY}
    endpoint:
      base_url: https://api.deepseek.com
  zhipu:
    spec: zhipu
    credentials:
      api_key: ${ZHIPU_API_KEY}
    endpoint:
      base_url: https://open.bigmodel.cn/api/coding/paas/v4

session:
  backend: sqlite
  sqlite:
    path: ./data/sessions.db

logging:
  level: info

trace:
  enabled: true
  path: ./data/trace.db
  capture_payload: false
```

启动服务：

```bash
godex serve --config ./godex.yaml
```

源码开发模式：

```bash
bun run dev
```

`bun run dev` 使用端口 `13145`；运行时配置默认端口是 `5678`。

## API

### 健康检查

```bash
curl http://localhost:5678/health
```

### 模型列表

```bash
curl http://localhost:5678/v1/models
```

`/v1/models` 返回已配置模型别名，不包含通配别名 `*`。

### Responses

```bash
curl http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.5",
    "input": "写一个 TypeScript add 函数。"
  }'
```

流式响应使用标准 Responses SSE 事件名：

```bash
curl -N http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{
    "model": "gpt-5.5",
    "stream": true,
    "input": "用两句话解释 Bun streams。"
  }'
```

## 模型路由

客户端可以传入：

- provider-qualified selector，例如 `deepseek/deepseek-v4-pro`
- 配置别名，例如 `gpt-5.5`
- 普通模型名；未命中别名时通过 `default_provider` 解析

`models.aliases` 的值必须是 `provider/model`，且 provider 必须存在于 `providers`。

## Provider 桥接行为

GodeX 构建 provider request 分三步：

1. 将客户端模型选择器解析为配置里的 provider 和上游模型。
2. 根据 provider `ProviderSpec` 规划参数、工具声明、`tool_choice`、响应格式、推理和 stream usage。
3. 将 Responses input 和 session history 转换为 Chat Completions messages，调用上游，再重建 Responses object 或 Responses SSE stream。

Provider 特有差异放在各 provider 的 `spec.ts`、`hooks.ts`、协议类型和 HTTP client 中。共享 Responses-to-Chat 策略放在 `src/bridge`。

## 结构化输出

当 provider 支持 `json_object` 但不支持原生 `json_schema` 时，GodeX 可以把 strict `json_schema` 请求降级到 `json_object`。

对 strict 降级 schema：

- 当前请求的 provider prompt 前言会加入 schema 格式指令。
- provider 收到 `response_format: { "type": "json_object" }`。
- GodeX 校验最终输出是否是合法 JSON。
- 同步响应输出非法时失败；流式响应输出非法时改写为终止 `response.failed` 事件。

校验器只检查 JSON 语法，不执行完整 JSON Schema 校验。

## 会话

Responses 可以通过 `previous_response_id` 保存并回放上下文。

- `session.backend: memory` 使用进程内存。
- `session.backend: sqlite` 持久化到 SQLite。
- `store: false` 跳过当前轮保存。
- session chain 保存 request snapshot 和 response output item，下一轮再重建 provider-neutral history。

## Trace 数据库

Trace 默认开启，默认写入 `./data/trace.db`。

Trace 记录包括：

- provider request 元数据
- provider request / response body 的摘要 payload
- 原始和转换后的 stream event
- usage 详情，包括上游返回的 cached tokens
- route error 和 provider error

设置 `trace.capture_payload: true` 会保存 payload JSON，最多 `trace.payload_max_bytes` 字节。敏感环境建议保持关闭。

## 开发

```bash
bun install                  # 安装依赖
bun run dev                  # 热重载开发服务器，端口 13145
bun run start                # 从源码启动服务
bun run build                # 为当前平台编译二进制
bun run compile:all          # 交叉编译所有支持平台
```

质量门禁：

```bash
bun run typecheck            # TypeScript
bun run lint                 # Biome check
bun run lint:fix             # Biome 自动修复
bun run format               # Biome 格式化
bun run test                 # 单元和集成测试，不含 src/e2e
bun run test:e2e             # mock 上游端到端测试
bun run test:zhipu           # 智谱 live 测试，需要 ZHIPU_API_KEY
bun run check                # typecheck + lint + test
bun run ci                   # typecheck + biome ci + test + e2e
```

## 源码地图

```text
src/
  cli/          Commander CLI, init wizard, runtime config loading
  config/       godex.yaml schema, defaults, env interpolation
  context/      ApplicationContext and per-request ResponsesContext
  bridge/       Provider-agnostic Responses-to-Chat planning and reconstruction
  providers/    Built-in provider specs, hooks, clients, and registry
  responses/    Sync and stream request pipelines
  server/       Bun routes for /health, /v1/models, /v1/responses
  session/      Memory and SQLite response session stores
  trace/        SQLite trace recorder and usage/error/event mappers
  protocol/     OpenAI protocol type definitions
  error/        GodeXError hierarchy and domain codes
```

## Provider 开发

Provider 目录形态：

```text
src/providers/<name>/
  spec.ts       ProviderSpec declaration
  client.ts     ProviderEdge construction with ChatProviderClient
  hooks.ts      Provider-specific patching, accessors, usage, stream deltas
  protocol/     Provider DTOs when needed
  index.ts      Public exports
```

共享兼容性策略放到 `src/bridge`；共享 provider transport 或协议 helper 放到 `src/providers/shared`。

## 许可证

Apache-2.0. See [LICENSE](./LICENSE).
