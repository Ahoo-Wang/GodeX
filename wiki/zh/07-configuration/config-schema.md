---
title: "配置 Schema"
description: "godex.yaml 配置选项完整参考。"
keywords: "GodeX, 配置 Schema, godex.yaml, YAML"
---

# 配置 Schema

GodeX 通过 `godex.yaml` 文件配置，通常由 `godex init` 创建。环境变量使用 `${VAR_NAME}` 语法插值。

## 完整 Schema

```yaml
server:
  port: 5678              # HTTP 监听端口
  host: "0.0.0.0"         # 监听地址
  idle_timeout: 30000     # 空闲连接超时（毫秒），默认：0（禁用）

default_provider: deepseek   # 模型无斜杠前缀时使用的提供商

models:
  aliases:
    "gpt-5.5": deepseek/deepseek-v4-pro   # 将别名映射到 provider/model
    "glm": zhipu/glm-5.1                   # 将别名映射到 provider/model
    "*": deepseek/deepseek-v4-flash        # 通配符兜底

providers:
  deepseek:
    spec: deepseek                      # 提供商规格名称（必填）
    credentials:
      api_key: ${DEEPSEEK_API_KEY}
    endpoint:
      base_url: https://api.deepseek.com
    timeout_ms: 30000

  zhipu:
    spec: zhipu                         # 提供商规格名称（必填）
    credentials:
      api_key: ${ZHIPU_API_KEY}
    endpoint:
      base_url: https://open.bigmodel.cn/api/coding/paas/v4
    timeout_ms: 30000

  minimax:
    spec: minimax                        # 提供商规格名称（必填）
    credentials:
      api_key: ${MINIMAX_API_KEY}
    endpoint:
      base_url: https://api.minimaxi.com/v1
    timeout_ms: 30000

session:
  backend: sqlite         # "sqlite" 或 "memory"
  sqlite:
    path: ./data/sessions.db

logging:
  level: info             # trace | debug | info | warn | error
  console:
    enabled: true
    level: info
  file:
    enabled: false
    level: debug
    dir: ./logs
    filename: godex.log
    max_size: 10485760    # 10MB
    max_files: 5

web_search:                      # 内置 Web 搜索（默认：启用，无后端）
  enabled: true                  # 总开关
  mode: auto                     # auto | provider_native | godex_managed | disabled
  provider: none                 # none | mock | zhipu（godex_managed 模式的搜索后端）
  on_unavailable: client_tool_call  # client_tool_call | fail | ignore
  max_iterations: 2              # 每个请求的最大托管搜索轮数
  timeout_ms: 10000              # 单次搜索超时

trace:
  enabled: true
  path: ./data/trace.db
  max_queue_size: 10000
  flush_interval_ms: 1000
  batch_size: 100
  capture_payload: false
  payload_max_bytes: 65536
```

## 类型定义

```mermaid
classDiagram

  class GodeXConfig {
    +server: ServerConfig
    +default_provider: string
    +models: ModelsConfig
    +providers: Record~string, ProviderConfig~
    +session: SessionConfig
    +logging: LoggingConfig
    +web_search: WebSearchConfig
    +trace: TraceConfig
  }

  class ServerConfig {
    +port: number
    +host: string
    +idle_timeout: number
  }

  class ProviderConfig {
    +spec: string
    +credentials: CredentialsConfig
    +endpoint: EndpointConfig
    +timeout_ms: number
  }

  class CredentialsConfig {
    +api_key: string
  }

  class EndpointConfig {
    +base_url: string
  }

  class ModelsConfig {
    +aliases: Record~string, string~
  }

  class SessionConfig {
    +backend: string
    +sqlite: SQLiteConfig
  }

  class LoggingConfig {
    +level: LogLevel
    +console: ConsoleLoggingConfig
    +file: FileLoggingConfig
  }

  class TraceConfig {
    +enabled: boolean
    +path: string
    +max_queue_size: number
    +flush_interval_ms: number
    +batch_size: number
    +capture_payload: boolean
    +payload_max_bytes: number
  }

  class WebSearchConfig {
    +enabled: boolean
    +mode: WebSearchMode
    +provider: WebSearchProvider
    +on_unavailable: WebSearchOnUnavailable
    +max_iterations: number
    +timeout_ms: number
  }

  GodeXConfig --> ServerConfig
  GodeXConfig --> ModelsConfig
  GodeXConfig --> ProviderConfig
  GodeXConfig --> SessionConfig
  GodeXConfig --> LoggingConfig
  GodeXConfig --> WebSearchConfig
  GodeXConfig --> TraceConfig
  ProviderConfig --> CredentialsConfig
  ProviderConfig --> EndpointConfig
```

## 提供商配置

每个提供商条目必须包含 `spec` 字段，匹配已注册的提供商定义名称。启动时会拒绝没有 `spec` 的旧版提供商配置。

```yaml
providers:
  myprovider:
    spec: myprovider           # 必填：匹配已注册的提供商定义
    credentials:
      api_key: ${MY_API_KEY}
    endpoint:
      base_url: https://api.example.com/v1
    timeout_ms: 30000
```

## Web 搜索

GodeX 可以两种方式运行 Web 搜索：让提供商原生处理，或由 GodeX 自行运行（"GodeX 托管"/"hosted"）并将结果反馈到续接请求中。`web_search` 块（[src/config/sections/web-search.ts:10](https://github.com/Ahoo-Wang/GodeX/blob/main/src/config/sections/web-search.ts#L10)）控制此行为。

::: warning 重要：原生提供商始终使用原生搜索
对于工具集已经包含 `web_search` 原生工具的提供商（智谱、小米），规划器会在**查询 `mode` 之前**就返回该工具为原生支持。这意味着 `mode: godex_managed` 和 `mode: disabled` 对这些提供商**没有影响** — 它们始终获得原生的 `web_search`。下面的 `mode` 设置仅用于管控 GodeX 如何处理**不**原生支持该工具的提供商（DeepSeek、MiniMax），或当你希望 GodeX 托管搜索循环时的行为。优先级（原生 → 降级 → web-search 规划）见 [tool-plan.ts:129](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/tools/tool-plan.ts#L129)。
:::

| 字段 | 默认值 | 说明 |
|-------|---------|-------------|
| `enabled` | `true` | 总开关。为 `false` 时，有效的 `mode` 变为 `disabled` 且 `available` 为 `false`。 |
| `mode` | `auto` | 执行策略 — 见下表（适用于非原生提供商）。 |
| `provider` | `none` | GodeX 在 `godex_managed` 模式下使用的搜索后端。 |
| `on_unavailable` | `client_tool_call` | 当托管搜索被选中但不可用时的处理方式。 |
| `max_iterations` | `2` | 每个请求的最大托管搜索轮数。 |
| `timeout_ms` | `10000` | 单次搜索超时（毫秒）。 |

### `mode` — 执行策略

这些模式适用于**不**原生支持 `web_search` 的提供商。规划器（[tool-plan.ts:164](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/tools/tool-plan.ts#L164)）只有在原生和降级检查之后才会进入 web-search 规划，因此对于原生提供商，无论 `mode` 如何，该工具始终由提供商处理。

| 模式 | 行为（非原生提供商） |
|------|----------|
| `auto` | 如果搜索 `provider` 后端 `available`，则由 GodeX 托管搜索循环（managed）；否则应用 `on_unavailable` 策略。 |
| `provider_native` | 以提供商原生执行声明该工具。对于没有原生 `web_search` 的提供商，会像 `auto` 一样落入 web-search 规划。 |
| `godex_managed` | GodeX 拦截 `web_search` 函数调用，通过配置的 `provider` 后端自行运行搜索，发出 `web_search_call` 生命周期（`in_progress` → `searching` → `completed` / failed），并提交带结果的续接请求。最多 `max_iterations` 轮。如果没有后端 `available`，则应用 `on_unavailable` 策略。 |
| `disabled` | 不提供托管循环。对于非原生提供商，`on_unavailable` 策略仍然适用（默认 `client_tool_call`），因此搜索工具仍可能作为客户端可见的函数调用暴露 — 设置 `on_unavailable: ignore`（或 `fail`）以完全抑制它。 |

### `provider` — 托管搜索后端

| 后端 | 说明 |
|----------|-------------|
| `none` | 无后端。托管搜索不可用（`available` 为 `false`）；此时应用 `on_unavailable` 策略。 |
| `mock` | 返回固定结果；用于测试。 |
| `zhipu` | [智谱 Web Search API](https://open.bigmodel.cn/dev/api/search-tool/websearch)。 |

::: warning 智谱搜索后端读取的是 provider 配置，而不仅仅是环境变量
选择 `provider: zhipu` 时，只有在 `godex.yaml` 中存在带 `credentials.api_key` 的 `providers.zhipu` 块时，后端才会 `available` — `createSearchService` 读取 `config.providers.zhipu.credentials.api_key`（[search/registry.ts:16-17](https://github.com/Ahoo-Wang/GodeX/blob/main/src/search/registry.ts#L16-L17)），当其缺失时回退到无操作 provider。因此，在只有 DeepSeek/MiniMax 的配置上，仅导出 `ZHIPU_API_KEY` 是**不够**的；需要添加完整的 `providers.zhipu` 条目（支持环境变量插值，例如 `api_key: ${ZHIPU_API_KEY}`），否则 GodeX 会走 `on_unavailable` 路径而不是托管搜索。
:::

### `on_unavailable` — 回退策略

适用于托管搜索循环被选中（`mode` 为 `auto`/`godex_managed`）但没有后端 `available` 的情况，以及 `mode` 为 `disabled` 但提供商为非原生时。

| 策略 | 行为 |
|--------|----------|
| `client_tool_call` | 将 `web_search` 调用作为普通函数调用转发给客户端（由客户端处理）。 |
| `fail` | 以 `BridgeError` 失败请求。 |
| `ignore` | 静默丢弃搜索调用。 |

::: tip
使用默认配置（`mode: auto`、`provider: none`）时，支持原生 Web 搜索的提供商（智谱、小米）直接使用它，其他提供商将 `web_search` 调用转发给客户端。要为**非原生**提供商启用 GodeX 托管搜索，设置 `provider: zhipu` **并**在 `godex.yaml` 中添加 `providers.zhipu` 块（带 `credentials.api_key`）——见上方警告。
:::

托管搜索循环由 `src/responses/web-search/` 中的 `HostedWebSearchStreamRunner` / `HostedWebSearchSyncRunner` 实现。它如何集成到事件生产阶段见[流式管道](../02-architecture/streaming-pipeline.md)。

## 环境变量插值

`${DEEPSEEK_API_KEY}` 等值在加载时从环境变量解析。缺少的变量会产生启动错误。

## 环境变量覆盖

除 YAML 插值外，以下环境变量可直接覆盖配置字段（CLI 标志优先级最高）：

| 变量 | 配置字段 | 说明 |
|------|---------|------|
| `GODEX_PORT` | `server.port` | 覆盖监听端口 |
| `GODEX_HOST` | `server.host` | 覆盖绑定地址 |
| `GODEX_LOG_LEVEL` | `logging.level` | 覆盖日志级别 |
| `GODEX_DEFAULT_PROVIDER` | `default_provider` | 未设置时回退到 `deepseek` |

[CLI 命令](/zh/07-configuration/cli-commands)

