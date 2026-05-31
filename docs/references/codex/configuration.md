# Codex 集成配置

将 Codex 桌面应用接入 GodeX 网关，让 Codex 使用 DeepSeek、智谱、MiniMax、Xiaomi MiMo 等模型。

## 工作原理

```
Codex 桌面应用
    │
    │  Responses API (OpenAI 协议)
    │  POST /v1/responses
    ▼
GodeX (localhost:5678)
    │
    │  Chat Completions API (各厂商协议)
    ▼
DeepSeek · 智谱 · MiniMax · Xiaomi MiMo
```

Codex 说 Responses 协议，GodeX 在中间翻译成各厂商的 Chat Completions 协议。对 Codex 来说，GodeX 就是一个普通的 OpenAI 兼容端点。

## 配置 Codex

编辑 Codex 配置文件 `~/.codex/config.toml`，添加或修改以下内容：

```toml
# 默认模型和 provider
model = "gpt-5.5"
model_provider = "godex"

# 推理努力程度：low / medium / high / xhigh
model_reasoning_effort = "xhigh"

# 注册 GodeX 为 custom provider
[model_providers.godex]
name = "GodeX"
base_url = "http://127.0.0.1:5678/v1"
wire_api = "responses"
supports_websockets = false
```

**关键字段说明：**

- `model`：Codex 使用的模型别名，对应 GodeX `godex.yaml` 中 `models.aliases` 的 key。推荐 `gpt-5.5`（主力）或 `gpt-5.4`（旗舰）。
- `model_provider`：指向下方 `[model_providers.<name>]` 的 provider 名称，此处为 `godex`。
- `base_url`：GodeX 服务地址。本地运行默认 `http://127.0.0.1:5678/v1`。
- `wire_api`：必须设为 `"responses"`，因为 GodeX 提供的是 Responses API。
- `supports_websockets`：GodeX 不支持 WebSocket，设为 `false`。

### 可用的模型别名

GodeX 默认 `godex.yaml` 中预置了以下 Codex 模型别名映射：

| Codex 模型名 | 用途 | 指向 Provider/Model |
|-------------|------|-------------------|
| `gpt-5.5` | 默认主力：复杂编码 / computer use / research | `deepseek/deepseek-v4-pro` |
| `gpt-5.4` | 旗舰：coding + reasoning + tool use + agentic | `deepseek/deepseek-v4-pro` |
| `gpt-5.4-mini` | 子任务调度 | `zhipu/glm-5.1` |
| `gpt-5.3-codex` | 编码专用：复杂软件工程 | `deepseek/deepseek-v4-pro` |
| `gpt-5.3-codex-spark` | 近实时编码迭代 | `zhipu/glm-5.1` |

你可以修改 `godex.yaml` 中的 `models.aliases` 来调整映射，Codex 侧无需改动。

## 启动 GodeX

```bash
# 确保 GodeX 已安装
npm install -g @ahoo-wang/godex

# 创建配置文件（引导式选择 provider 并填写 API Key）
godex init

# 启动服务
godex serve --config ./godex.yaml
```

服务默认监听 `localhost:5678`。启动成功后会输出地址和已注册的 provider 信息。

## 验证配置

### 1. 检查 GodeX 健康状态

```bash
curl http://localhost:5678/health
```

返回示例：

```json
{
  "status": "ok",
  "providers": ["deepseek", "zhipu", "minimax", "xiaomi"],
  "unsupported_providers": []
}
```

### 2. 检查可用模型列表

```bash
curl http://localhost:5678/v1/models
```

### 3. 发送测试请求

```bash
curl http://localhost:5678/v1/responses \
  -H 'content-type: application/json' \
  -d '{"model":"gpt-5.5","input":"Hello, who are you?"}'
```

## 切换模型

在 Codex 会话中可以通过切换模型来使用不同 provider。修改 `config.toml` 中的 `model` 字段即可：

```toml
# 主力模型
model = "gpt-5.5"

# 或使用旗舰模型
model = "gpt-5.4"

# 或快速 spark 模型
model = "gpt-5.3-codex-spark"
```

所有模型别名到 provider/model 的实际映射都在 `godex.yaml` 中管理，Codex 侧只认别名。

## 多 Provider 密钥配置

GodeX 支持同时配置多个 provider。在 `godex.yaml` 中为每个 provider 填写 API Key：

```yaml
providers:
  deepseek:
    credentials:
      api_key: "${DEEPSEEK_API_KEY}"
  zhipu:
    credentials:
      api_key: "${ZHIPU_API_KEY}"
```

推荐使用环境变量而非明文写入密钥。GodeX 支持 `${ENV_VAR}` 语法自动展开。

## 模型推理努力

Codex 的 `model_reasoning_effort` 设置会被 GodeX 桥接为对应 provider 的 reasoning 参数。支持的值为 `low`、`medium`、`high`、`xhigh`。不同 provider 对该参数的处理方式不同：

- **DeepSeek**：原生 reasoning_effort，直接透传。
- **智谱**：布尔 thinking 开关，reasoning_effort 映射为开启/关闭。
- **MiniMax**：无 native reasoning，该参数被忽略。
- **Xiaomi MiMo**：布尔 thinking 开关，与智谱类似。

GodeX 会在响应中附带兼容性诊断信息，告诉你哪些能力被降级或忽略。

## 相关文件

- Codex 配置文件：`~/.codex/config.toml`
- GodeX 配置文件：`godex.yaml`（项目目录或 `~/.godex/godex.yaml`）

## 更多信息

- [GodeX README](https://github.com/Ahoo-Wang/GodeX)
- [GodeX 架构文档](https://godex.ahoo.me/)
- [模型别名配置](https://github.com/Ahoo-Wang/GodeX?tab=readme-ov-file#model-aliases)
