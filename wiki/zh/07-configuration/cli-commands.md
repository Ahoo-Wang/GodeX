---
title: "CLI 命令"
description: "godex 二进制文件的命令行接口参考。"
---

# CLI 命令

GodeX 以单一二进制文件（`godex`）发布，包含三个子命令。

## `godex serve`

启动网关 HTTP 服务器。

```bash
godex serve                    # 使用默认配置启动
godex serve -c /path/to.yaml  # 使用自定义配置文件
```

从当前目录（或 `-c` 指定路径）读取 `godex.yaml`，初始化所有组件并开始监听。

## `godex init`

交互式创建 `godex.yaml` 配置文件。

```bash
godex init
```

提示输入：
- 服务器端口
- 默认提供商
- 提供商 API 密钥和基础 URL
- 模型映射
- 会话后端（内存或 SQLite）
- 日志级别

## `godex config check`

在不启动服务器的情况下验证当前配置。

```bash
godex config check
```

检查：
- YAML 语法有效性
- 必填字段是否存在
- 提供商配置完整性
- 模型映射格式

## 构建命令（开发）

```bash
bun run dev          # 热重载开发服务器（端口 13145）
bun run build        # 编译当前平台的原生二进制
bun run compile:all  # 交叉编译全部 6 个平台二进制
```

[测试指南](/zh/08-testing/testing-guide)
