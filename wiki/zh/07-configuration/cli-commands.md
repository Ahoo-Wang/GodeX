---
title: "CLI 命令"
description: "godex 二进制文件的命令行接口参考。"
keywords: "GodeX, CLI 命令, serve, init, config"
---

# CLI 命令

GodeX 以单一二进制文件（`godex`）发布，包含三个子命令。`godex serve` 是默认命令 — 直接运行 `godex` 等同于 `godex serve`。

## `godex serve`

启动网关 HTTP 服务器。

```bash
godex serve                    # 使用默认配置启动
godex serve -c /path/to.yaml  # 使用自定义配置文件
godex serve --port 8080       # 覆盖端口
godex serve --host 127.0.0.1  # 覆盖绑定地址
godex serve --log-level debug # 覆盖日志级别
```

从当前目录（或 `-c` 指定路径）读取 `godex.yaml`，初始化所有组件并开始监听。

## `godex init`

交互式创建 `godex.yaml` 配置文件。

```bash
godex init                     # 交互式向导
godex init --config ~/.godex/config.yaml  # 指定输出路径
```

提示输入：
- 要配置的 LLM 提供商（DeepSeek、智谱或两者）
- 每个提供商的 API 密钥和基础 URL
- 默认提供商选择（配置多个提供商时）
- 服务器端口
- 会话后端（SQLite 或内存）
- 日志级别
- 配置文件输出路径（主目录或工作目录）

生成的配置包含一个通配符模型别名（`"*"`），指向默认提供商的默认模型。

## `godex config check`

在不启动服务器的情况下验证当前配置。

```bash
godex config check
godex config check -c /path/to.yaml
```

检查：
- YAML 语法有效性
- 必填字段是否存在
- 提供商配置完整性
- 模型映射格式

## `godex config print`

打印有效配置（敏感信息已脱敏）。

```bash
godex config print
```

输出解析后的配置为 JSON，API 密钥替换为 `***`。

## 构建命令（开发）

```bash
bun run dev          # 热重载开发服务器（端口 13145）
bun run build        # 编译当前平台的原生二进制
bun run compile:all  # 交叉编译全部 6 个平台二进制
```

## 环境变量覆盖

| 变量 | 配置字段 | 说明 |
|------|---------|------|
| `GODEX_PORT` | `server.port` | 覆盖监听端口 |
| `GODEX_HOST` | `server.host` | 覆盖绑定地址 |
| `GODEX_LOG_LEVEL` | `logging.level` | 覆盖日志级别 |
| `GODEX_DEFAULT_PROVIDER` | `default_provider` | 未设置时回退到 `zhipu` |

[测试指南](/zh/08-testing/testing-guide)
