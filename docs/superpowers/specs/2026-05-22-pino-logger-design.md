# Pino 日志系统重构设计

## 目标

用 pino 重构 Godex 日志系统，去除 `component` 概念，event 使用点分格式，支持按日期轮转的文件存储。核心目的是更清晰的问题跟踪。

## 设计概览

- pino 作为核心 logger
- pino transport（worker thread）处理异步 I/O
- `pino-pretty` 用于 console pretty-print
- `pino-roll` 用于按日期文件轮转
- event 用 `<domain>.<entity>.<action>` 点分命名
- console 默认 pretty-print，文件默认 JSON
- 文件和 console 的时间格式统一为 `2026-05-22 10:30:00.123`

## 配置 Schema

```yaml
logging:
  level: info              # 全局默认级别

  console:
    enabled: true
    level: info            # 可选，不设则用全局 level
    pretty: true           # true = pino-pretty，false = JSON

  file:
    enabled: false
    level: debug           # 可选，不设则用全局 level
    dir: ~/.godex/logs
    filename: godex.log
```

对应 TypeScript 类型：

```typescript
export interface LoggingConfig {
  level: LogLevel;
  console?: ConsoleLoggingConfig;
  file?: FileLoggingConfig;
}

export interface ConsoleLoggingConfig {
  enabled: boolean;
  level?: LogLevel;
  pretty?: boolean; // default true
}

export interface FileLoggingConfig {
  enabled: boolean;
  level?: LogLevel;
  dir: string;
  filename: string;
}
```

`dir` 支持 `~` 展开。`console.level` 和 `file.level` 可选，不设则继承全局 `logging.level`。

## Logger 接口

```typescript
export type LogAttr = Record<string, unknown> | (() => Record<string, unknown>);

export interface Logger {
  readonly level: LogLevel;
  child(bindings: Record<string, unknown>): Logger;
  trace(event: string, attr?: LogAttr): void;
  debug(event: string, attr?: LogAttr): void;
  info(event: string, attr?: LogAttr): void;
  warn(event: string, attr?: LogAttr): void;
  error(event: string, attr?: LogAttr): void;
}
```

与当前接口的区别：去掉 `component` 属性和参数；`child()` 只接收 bindings 业务字段。

底层桥接到 pino：

```typescript
const pinoInstance = pino(
  {
    level: config.level,
    timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
  },
  pino.transport({ targets }),
);

function log(level: LogLevel, event: string, attr?: LogAttr): void {
  const resolved = resolveAttr(attr);
  pinoInstance[level]({ event, ...resolved });
}
```

## Transport 层

```typescript
function createTransports(config: LoggingConfig): TransportTargetOptions[] {
  const transports: TransportTargetOptions[] = [];

  // Console transport
  if (config.console?.enabled !== false) {
    const consoleLevel = config.console?.level ?? config.level;
    if (config.console?.pretty !== false) {
      transports.push({
        target: "pino-pretty",
        level: consoleLevel,
        options: {
          colorize: true,
          translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
          messageKey: "event",
        },
      });
    } else {
      transports.push({
        target: "pino/file",
        level: consoleLevel,
        options: { destination: 1 },
      });
    }
  }

  // File transport
  if (config.file?.enabled) {
    const fileLevel = config.file.level ?? config.level;
    const dir = expandHomeDir(config.file.dir);
    const filepath = path.join(dir, config.file.filename);

    transports.push({
      target: "pino-roll",
      level: fileLevel,
      options: {
        file: filepath,
        frequency: "daily",
        mkdir: true,
        size: "100m",
      },
    });
  }

  return transports;
}
```

轮转行为：当天写入 `godex.log`，次日轮转为 `godex.2026-05-22.log` 并创建新文件。

## 时间格式

JSON 文件输出统一使用可读时间戳。通过 pino 自定义 timestamp formatter 实现：

```typescript
timestamp: () => `,"time":"${formatTimestamp(new Date())}"`,
```

输出格式：`2026-05-22 10:30:00.123`

## Event 命名约定

`<domain>.<entity>.<action>` 三层点分格式。

### 命名映射表

| 之前 | 之后 |
|---|---|
| `server_started` | `godex.started` |
| `shutting_down` | `godex.shutting_down` |
| `request_received` | `responses.request.received` |
| `request_error` | `responses.request.error` |
| `provider_error` | `responses.request.provider_error` |
| `stream_completed` | `responses.stream.completed` |
| `session_saved` | `session.saved` |
| `session_save_error` | `session.save.error` |
| `stream_session_save_error` | `session.save.stream_error` |
| `unsupported_parameter_downgraded` | `provider.parameter.downgraded` |
| `unsupported_tool_skipped` | `provider.tool.skipped` |
| `unexpected_error` | `godex.unexpected_error` |

### 使用范式

```typescript
// 应用级别
logger.info("godex.started", { version, host, port });

// 请求级别
const requestLogger = logger.child({ request_id, response_id });
requestLogger.info("responses.request.received", { model, stream });

// 上游调用
ctx.logger.info("upstream.request.started", { provider, model, stream });
ctx.logger.info("upstream.response.received", { provider, status, duration_ms });

// 业务警告
ctx.logger.warn("provider.parameter.downgraded", { parameter, reason });
```

## 调用点迁移

### ApplicationContext

```typescript
// 之前
this.logger = createLogger(config.logging.level, { component: "server" });
// 之后
this.logger = createLogger(config.logging);
```

### ResponsesContext

```typescript
// 之前
this.logger = app.logger.child({
  component: "stream",
  defaults: { requestId: this.requestId, responseId: this.responseId },
});
// 之后
this.logger = app.logger.child({
  request_id: this.requestId,
  response_id: this.responseId,
});
```

### Server — `src/server/index.ts`

```typescript
logger.info("godex.started", { port, host });
```

### Responses route — `src/server/routes/responses/index.ts`

```typescript
logger.info("responses.request.received", { model, ... });
logger.error("responses.request.provider_error", ...);
logger.error("godex.unexpected_error", ...);
```

### DefaultAdapter — `src/adapter/default-adapter.ts`

```typescript
ctx.logger.warn("session.save.error", { ... });
ctx.logger.debug("session.saved", { responseId });
```

### Stream transformer — `src/adapter/transformers/response-session-persistence-transformer.ts`

```typescript
ctx.logger.info("responses.stream.completed", { ... });
ctx.logger.warn("session.save.stream_error", { ... });
```

### Zhipu provider — `src/providers/zhipu/`

```typescript
ctx.logger.warn("provider.tool.skipped", { ... });
ctx.logger.warn("provider.parameter.downgraded", { ... });
```

### CLI — `src/cli/serve.ts`

```typescript
logger.info("godex.shutting_down", { signal });
```

## 输出示例

Console（pretty-print）：

```
INFO [2026-05-22 10:30:00.123] godex.started: port=13145 host=0.0.0.0
INFO [2026-05-22 10:30:01.456] responses.request.received: request_id=req_abc123 response_id=resp_def456 model=gpt-4 stream=true
WARN [2026-05-22 10:30:02.789] provider.parameter.downgraded: request_id=req_abc123 parameter=temperature reason="not supported"
```

File（JSON）：

```json
{"level":30,"time":"2026-05-22 10:30:00.123","event":"godex.started","port":13145,"host":"0.0.0.0"}
{"level":30,"time":"2026-05-22 10:30:01.456","event":"responses.request.received","request_id":"req_abc123","response_id":"resp_def456","model":"gpt-4","stream":true}
{"level":40,"time":"2026-05-22 10:30:02.789","event":"provider.parameter.downgraded","request_id":"req_abc123","parameter":"temperature","reason":"not supported"}
```

## 模块结构

```
src/logger/
  index.ts          # Logger 接口 + createLogger 工厂
  transport.ts      # createTransports 构建逻辑
  index.test.ts     # 单元测试
```

## 新增依赖

- `pino` — 核心 logger
- `pino-pretty` — console pretty-print（devDependency，作为 transport target 按需加载）
- `pino-roll` — 文件日期轮转

## 测试策略

- `createLogger` 工厂函数测试：验证级别过滤、child 合并、lazy thunk
- `createTransports` 测试：验证 transport target 配置正确性
- 各调用点迁移后保持现有测试通过，仅更新 event 名和断言
