# Responses API → 智谱 Chat Completions API 迁移指南

> **文档定位**：本文档帮助已熟悉 OpenAI Responses API 的开发者，将其代码适配到智谱 Chat Completions API。由于智谱当前未提供原生 Responses API，本文档提供字段级映射、范式转换指南和功能缺口分析。

## 目录

- [1. 概述](#1-概述)
- [2. 端点与认证](#2-端点与认证)
- [3. 请求参数映射](#3-请求参数映射)
- [4. Item → Message 映射](#4-item--message-映射)
- [5. 工具映射](#5-工具映射)
- [6. 多轮对话](#6-多轮对话)
- [7. 功能缺口总览](#7-功能缺口总览)

---

## 1. 概述

### OpenAI Responses API 核心特性

Responses API 是 OpenAI 推出的新一代 API 原语，相比 Chat Completions 具有以下优势：

| 特性 | 说明 |
|------|------|
| **Agentic 循环** | 单次请求内模型可调用多个工具（web_search, file_search, code_interpreter, MCP 等） |
| **Stateful 上下文** | 通过 `store: true` 保持跨轮次状态，自动保留推理和工具上下文 |
| **统一的 Item 模型** | 输入/输出使用 `Item` 联合类型，清晰分离不同语义单元 |
| **更优的推理性能** | 内部评测 SWE-bench 提升 3% |
| **更低的缓存成本** | 缓存利用率提升 40%-80% |
| **加密推理** | 支持零数据保留（ZDR）场景的加密推理上下文 |

### 智谱 Chat Completions API 定位

智谱目前提供的是 **Chat Completions 范式** 的 API（`POST /paas/v4/chat/completions`），在以下方面与 Responses API 存在范式差异：

- 使用 `messages` 数组而非 `input` Items
- 工具调用嵌入在 assistant message 的 `tool_calls` 字段中
- 多轮对话需手动管理上下文
- 不支持 `previous_response_id` 链式调用

**本指南的目标是将 Responses API 的思维模型映射到智谱的实现上。**

---

## 2. 端点与认证

### 端点映射

| | OpenAI Responses | 智谱 Chat Completions |
|------|------|------|
| **方法** | `POST` | `POST` |
| **路径** | `/v1/responses` | `/paas/v4/chat/completions` |
| **Base URL** | `https://api.openai.com` | `https://open.bigmodel.cn/api` |

### 认证头

| | OpenAI | 智谱 |
|------|------|------|
| **Header** | `Authorization: Bearer $OPENAI_API_KEY` | `Authorization: Bearer $ZHIPU_API_KEY` |
| **Key 获取** | [OpenAI Platform](https://platform.openai.com/api-keys) | [智谱开放平台](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) |

### 完整请求示例

**OpenAI Responses:**
```bash
curl https://api.openai.com/v1/responses \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-5",
    "instructions": "You are a helpful assistant.",
    "input": "Hello!"
  }'
```

**智谱（等价调用）:**
```bash
curl https://open.bigmodel.cn/api/coding/paas/v4/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ZHIPU_API_KEY" \
  -d '{
    "model": "glm-5.1",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## 3. 请求参数映射

### 3.1 输入与指令

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `input: string` | `messages[].content` (role: user) | ✅ 支持 | 直接包装为 user message |
| `input: array` | `messages[]` 数组 | ✅ 支持 | 见 [Item → Message 映射](#4-item--message-映射) |
| `instructions: string` | `messages[].content` (role: system) | ✅ 支持 | 直接作为 system message 插入 |
| `prompt` (模板引用) | 无 | ❌ 不支持 | 需客户端自行实现模板变量替换 |

**注意**：Responses API 中 `instructions` 不和 `previous_response_id` 一起传递到下一轮，这简化了 system message 的替换。智谱需要在每轮请求中显式设置 system message。

**类型标记差异**：OpenAI Responses 中 `function_call` 使用**内部标记**（type 在对象内部），而 Chat Completions 使用**外部标记**（type 在包裹层）。智谱沿用了 Chat Completions 的外部标记方式（在 assistant message 的 `tool_calls[]` 中声明类型）。

**`strict` 默认值差异**：Responses API 中 function 定义默认 `strict: true`，Chat Completions 中默认非 strict，智谱沿用 Chat Completions 行为。

### 3.2 模型选择

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `model: string` | `model: string` | ✅ 支持 | 模型名不同，见下方模型对照 |

**模型对照建议：**

| OpenAI 模型 | 智谱推荐模型 | 说明 |
|------|------|------|
| `gpt-5.4` / `gpt-5` | `glm-5.1` | 最新旗舰，复杂推理 |
| `gpt-5-mini` / `gpt-5-nano` | `glm-5-turbo` | 快速推理 |
| `gpt-5-codex` | `glm-5.1` | 代码生成 |
| `gpt-4o` | `glm-4.7` | 通用多模态 |
| `gpt-4o-mini` | `glm-4.7-flash` | 轻量快速 |
| `o3` / `o4-mini` | `glm-5.1` (开启 thinking) | 深度推理 |
| 视觉模型 (`gpt-4o`) | `glm-5v-turbo` | 图片/视频理解 |
| 音频模型 (`gpt-4o-audio-preview`) | `glm-4-voice` | 语音对话 |

### 3.3 文本生成控制

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `temperature` | `temperature` | ✅ 支持 | 智谱范围 `[0.0, 1.0]`，OpenAI 范围 `[0, 2]`。需将 OpenAI 的 1.0-2.0 映射到智谱的 1.0 |
| `top_p` | `top_p` | ✅ 支持 | 智谱范围 `[0.01, 1.0]`，OpenAI 范围 `[0, 1]` |
| `max_output_tokens` | `max_tokens` | ✅ 支持 | 语义一致，参数名不同。智谱 GLM-5.1/5/4.7 系列最大 128K，GLM-4.5 系列最大 96K |
| `text.verbosity` | 无 | ❌ 不支持 | 智谱无独立 verbosity 控制；Godex 接受并回显该字段，但不会传给上游 |
| `stop` (内联在 text 中) | `stop` (顶层数组) | ⚠️ 部分支持 | 智谱支持字符串数组，最多 4 个停止词 |
| `truncation` | 无 | ❌ 不支持 | 智谱无自动截断策略配置；Godex 接受省略/`disabled`，对 `auto` 会在上游调用前返回明确错误 |

### 3.4 推理 / 思考

OpenAI Responses 使用 `reasoning` 对象配置：

```json
{
  "reasoning": {
    "effort": "medium",
    "summary": "auto"
  }
}
```

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `reasoning.effort` | `thinking.type: "enabled"` | ⚠️ 部分支持 | 智谱仅支持 enabled/disabled 二元开关，不支持 effort 级别微调。GLM-5.1/5/5-Turbo/5v-Turbo/4.7/4.5V 开启后为强制思考，GLM-4.6/4.6V/4.5 为自动判断 |
| `reasoning.summary` | `reasoning_content` (响应字段) | ⚠️ 部分支持 | 智谱返回 `reasoning_content` 在流式 delta 和完成响应中，但不支持 summary 压缩级别控制；Godex 接受并降级为普通 thinking |
| `reasoning.generate_summary` (废弃) | 同上 | ⚠️ 部分支持 | Godex 接受但不向上游传递该控制项 |
| 加密推理 `reasoning.encrypted_content` | 无 | ❌ 不支持 | 智谱不提供加密推理功能 |
| 保留历史推理 `clear_thinking: false` | `thinking.clear_thinking` | ✅ 支持 | 智谱支持通过 `clear_thinking: false` 保留历史推理内容 |

**示例：开启思考模式**

OpenAI Responses:
```json
{
  "model": "gpt-5",
  "input": "写一首关于春天的诗",
  "reasoning": {"effort": "high", "summary": "detailed"}
}
```

智谱：
```json
{
  "model": "glm-5.1",
  "messages": [{"role": "user", "content": "写一首关于春天的诗"}],
  "thinking": {"type": "enabled"}
}
```

### 3.5 结构化输出

OpenAI Responses 使用 `text.format`，智谱使用顶层 `response_format`：

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `text.format.type: "json_schema"` | `response_format.type: "json_object"` | ⚠️ 部分支持 | 智谱仅支持 `json_object` 模式，不支持完整 JSON Schema 约束 |
| `text.format.name` | 无 | ❌ 不支持 | 智谱无 schema 命名 |
| `text.format.schema` | 无 | ❌ 不支持 | 智谱无 strict schema 验证。需在 prompt 中详细描述期望的 JSON 结构 |
| `text.format.strict` | 无 | ❌ 不支持 | — |
| `text.format.type: "text"` (默认) | `response_format.type: "text"` (默认) | ✅ 支持 | 普通文本输出 |

**迁移示例：**

OpenAI Responses (Structured Outputs):
```json
{
  "model": "gpt-5",
  "input": "Jane, 54 years old",
  "text": {
    "format": {
      "type": "json_schema",
      "name": "person",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "name": {"type": "string", "minLength": 1},
          "age": {"type": "number", "minimum": 0, "maximum": 130}
        },
        "required": ["name", "age"],
        "additionalProperties": false
      }
    }
  }
}
```

智谱（JSON mode + Prompt 约束）:
```json
{
  "model": "glm-5.1",
  "messages": [{
    "role": "user",
    "content": "Jane, 54 years old\n\n请以 JSON 格式返回以下结构，不要返回其他内容：\n{\n  \"name\": \"姓名 (string)\",\n  \"age\": 年龄 (number, 0-130)\n}\n必须包含 name 和 age 字段，不允许额外字段。"
  }],
  "response_format": {"type": "json_object"}
}
```

### 3.6 流式输出

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `stream: true` | `stream: true` | ✅ 支持 | 两者均使用 SSE，以 `data: [DONE]` 结束 |
| `stream_options.include_obfuscation` | 无 | ❌ 不支持 | 智谱无可混淆化选项；Godex 接受并忽略该可选项 |

**流式响应结构差异：**

OpenAI Responses 流式事件：
- `response.created`
- `response.in_progress`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.completed`

智谱流式块：
- 标准 SSE delta chunk，包含 `choices[0].delta.content`
- 思考内容在 `choices[0].delta.reasoning_content`
- 工具调用在 `choices[0].delta.tool_calls`

### 3.7 管理与安全

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `store` | 无 | ❌ 不支持 | 智谱无服务端存储/检索。需客户端自行持久化 |
| `previous_response_id` | 无 | ❌ 不支持 | 智谱无链式 ID 引用。需手动拼接上下文 |
| `conversation` | 无 | ❌ 不支持 | 智谱无 Conversation 对象 |
| `metadata` | 无 | ❌ 不支持 | 智谱无元数据附加 |
| `safety_identifier` | `user_id` | ⚠️ 功能相似 | 智谱提供 `user_id` 用于终端用户标识，用途类似但非完全等价 |
| `prompt_cache_key` | 无 | ❌ 不支持 | 智谱无显式缓存键控制 |
| `prompt_cache_retention` | 无 | ❌ 不支持 | 智谱自动缓存，无 retention 配置 |
| `service_tier` | 无 | ❌ 不支持 | 智谱无服务层级选择 |
| `background` | 无 | ❌ 不支持 | 智谱无后台异步执行 |
| `max_tool_calls` | 无 | ❌ 不支持 | 智谱无工具调用次数上限控制；Godex 接受并回显，但不向上游传递 |
| `parallel_tool_calls` | 无（默认并行） | ⚠️ 无显式控制 | 智谱无显式并行开关 |
| `context_management` | 无 | ❌ 不支持 | 智谱无自动压缩配置 |

### 3.8 其他参数

| Responses 参数 | 智谱参数 | 状态 | 说明 |
|------|------|------|------|
| `n` | 无 | ❌ 不支持 | Responses 已移除此参数，智谱也不支持多 choice 生成 |
| `seed` | 无 | ❌ 不支持 | 智谱无确定性种子 |
| `logprobs` / `top_logprobs` | 无 | ❌ 不支持 | 智谱不返回 logprobs |
| `frequency_penalty` / `presence_penalty` | 无 | ❌ 不支持 | 智谱无频率/存在惩罚 |
| `do_sample` (智谱特有) | `do_sample` | N/A | OpenAI 无此参数。智谱用于开关采样策略，默认 true。为 false 时忽略 temperature/top_p，总是选最高概率 token |

---

## 4. Item → Message 映射

Responses API 的核心范式是 **Item 联合类型**，每个 Item 是一个独立的语义单元。智谱使用 **Messages 数组**，工具调用嵌入在 assistant message 内部。

### 4.1 输入侧：Item 类型到 Message 的转换

| Responses Item 类型 | 智谱 Message 角色 | 转换方式 |
|------|------|------|
| `EasyInputMessage {"role": "user", "content": "..."}` | `{"role": "user", "content": "..."}` | 直接映射 |
| `EasyInputMessage {"role": "system", "content": "..."}` | `{"role": "system", "content": "..."}` | 直接映射 |
| `EasyInputMessage {"role": "developer", "content": "..."}` | `{"role": "system", "content": "..."}` | developer → system（智谱不支持 developer role） |
| `EasyInputMessage {"role": "assistant", "content": "..."}` | `{"role": "assistant", "content": "..."}` | 直接映射（历史回复） |
| `FunctionCallOutput {"call_id": "...", "output": "..."}` | `{"role": "tool", "tool_call_id": "...", "content": "..."}` | 转为 tool message |
| `ComputerCallOutput` | — | ❌ 不支持 |
| `WebSearchCall` (作为输入) | — | ❌ 不支持（智谱 web_search 结果在响应的 `web_search` 字段返回，不作为输入 item 传递） |
| `FileSearchCall` (作为输入) | — | ❌ 不支持 |
| `Reasoning` (加密推理 item) | `reasoning_content` (字段) | ⚠️ 仅 GLM-4.5+ 支持，通过 `clear_thinking: false` 保留历史推理 |

### 4.2 输出侧：Response Output 到 Message 的转换

| Responses Output 类型 | 智谱响应位置 | 转换方式 |
|------|------|------|
| `ResponseOutputMessage` (type: "message", role: "assistant") | `choices[0].message` | 直接映射 |
| `FunctionCall` (type: "function_call") | `choices[0].message.tool_calls[]` | 从独立 item 转为 message 内的 tool_calls 数组 |
| `WebSearchCall` (type: "web_search_call") | `web_search` 顶层字段 + `choices[0].message.tool_calls[]` | 搜索结果在 `web_search[]` 返回，调用信息在 `tool_calls[]` |
| `FileSearchCall` (type: "file_search_call") | — | ❌ 智谱使用 retrieval tools 在不同范式下工作 |
| `ComputerCall` (type: "computer_call") | — | ❌ 不支持 |
| `CodeInterpreterCall` | — | ❌ 不支持 |
| `Reasoning` item (type: "reasoning") | `choices[0].message.reasoning_content` | 不是独立 item，是 message 上的字符串字段 |
| `ImageGenerationCall` | — | ❌ 不支持 |

### 4.3 代码示例：函数调用

**OpenAI Responses:**
```python
# 请求
response = client.responses.create(
    model="gpt-5",
    input=[
        {"role": "user", "content": "北京的天气怎么样？"}
    ],
    tools=[{
        "type": "function",
        "name": "get_weather",
        "description": "获取指定城市的天气",
        "parameters": {
            "type": "object",
            "properties": {
                "city": {"type": "string", "description": "城市名称"}
            },
            "required": ["city"]
        }
    }]
)

# 输出：function_call 是 output 数组中的独立 item
for item in response.output:
    if item.type == "function_call":
        print(item.call_id, item.name, item.arguments)
```

**智谱：**
```python
# 请求
response = client.chat.completions.create(
    model="glm-5.1",
    messages=[
        {"role": "user", "content": "北京的天气怎么样？"}
    ],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "城市名称"}
                },
                "required": ["city"]
            }
        }
    }]
)

# 输出：tool_calls 在 assistant message 内部
msg = response.choices[0].message
if msg.tool_calls:
    for tc in msg.tool_calls:
        print(tc.id, tc.function.name, tc.function.arguments)
```

**关键差异总结：**

1. **函数定义结构**：Responses 使用内部标记（`{"type": "function", "name": "...", "parameters": {...}}`），智谱使用外部标记（`{"type": "function", "function": {"name": "...", "parameters": {...}}}`）
2. **函数调用结果**：Responses 中是独立的 `function_call` item 和 `function_call_output` item，智谱中 `tool_calls` 在 assistant message 内，结果通过 `role: "tool"` message 提交
3. **strict 默认值**：Responses 默认 `strict: true`，智谱无此概念

---

## 5. 工具映射

### 5.1 Function 工具

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 定义位置 | `tools[]` 顶层数组 | `tools[]` 顶层数组 | ✅ 一致 |
| 最大函数数 | — | 128 个 | — |
| 函数定义结构 | 内部标记：`{"type": "function", "name": "...", "parameters": {...}}` | 外部标记：`{"type": "function", "function": {"name": "...", "parameters": {...}}}` | ⚠️ 结构不同 |
| strict 模式 | 默认 `true` | 不支持 | ❌ |
| tool_choice: auto | ✅ | ✅ (默认，仅支持 auto) | ⚠️ 智谱仅支持 `auto` |
| tool_choice: required | ✅ | ❌ | Godex 降级为智谱 `auto` |
| tool_choice: none | ✅ | ❌ (不传 tools 即可) | Godex 会通过省略 `tools` 和 `tool_choice` 降级实现 |
| tool_choice: 指定函数 / custom / shell / apply_patch | ✅ | ❌ | Godex 降级为智谱 `auto` |
| 并行工具调用 | `parallel_tool_calls: true` | 默认并行，无显式控制 | ⚠️ |
| 流式工具调用 | — | `tool_stream: true` (仅 GLM-5.1/5/5-Turbo/4.7/4.6) | N/A |

### 5.2 Codex 工具降级

Codex 常用的客户端执行工具在智谱侧没有原生 Responses item 类型。Godex 会尽量保留语义，将这些工具降级成智谱 `function` tool，并在后续请求中把工具调用历史转换成 Chat Completions 的 `assistant.tool_calls` + `tool` 消息：

| Responses / Codex 工具 | Godex 降级策略 |
|------|------|
| `local_shell` | 降级为 `function.name = "local_shell"` |
| `shell` | 降级为 `function.name = "shell"` |
| `apply_patch` | 降级为 `function.name = "apply_patch"` |
| `custom` | 降级为同名 function，名称会替换为智谱可接受的字符 |
| `namespace` | 展平为 `namespace__tool` function 名称 |
| `web_search_preview` | 降级为智谱 `web_search` |
| `mcp.allowed_tools` object filter | `tool_names` 降级为显式字符串数组；只包含 `read_only` 的过滤条件会被忽略 |

仍无法运行的 provider-side built-in（例如无客户端执行回路的 `code_interpreter`、`image_generation`、`computer`）不报错，降级处理并记录 warn 日志。

**定义结构对照：**

OpenAI Responses:
```json
{
  "type": "function",
  "name": "get_weather",
  "description": "获取指定城市的天气信息",
  "parameters": {
    "type": "object",
    "properties": {
      "city": {"type": "string", "description": "城市名称"}
    },
    "required": ["city"]
  }
}
```

智谱：
```json
{
  "type": "function",
  "function": {
    "name": "get_weather",
    "description": "获取指定城市的天气信息",
    "parameters": {
      "type": "object",
      "properties": {
        "city": {"type": "string", "description": "城市名称"}
      },
      "required": ["city"]
    }
  }
}
```

### 5.2 Web Search 工具

OpenAI 的 web_search 是**服务端全托管**的：只需声明类型，模型自动搜索。智谱提供更**细粒度的控制**。

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 启用方式 | `{"type": "web_search"}` | `{"type": "web_search", "web_search": {"enable": true, "search_engine": "search_std"}}` | ⚠️ 配置不同 |
| 搜索引擎选择 | 无 | ✅ `search_std` / `search_pro` / `search_pro_sogou` / `search_pro_quark` | N/A |
| 搜索意图识别 | 自动 | `search_intent: true/false` 可配置 | N/A |
| 强制搜索 | 无 | `require_search: true` | N/A |
| 搜索结果条数 | 自动 | `count: 1-50`, 默认 10 | N/A |
| 搜索时间范围 | 无 | `search_recency_filter: oneDay/oneWeek/oneMonth/oneYear/noLimit` | N/A |
| 域名过滤 | `filters.allowed_domains` | `search_domain_filter` (白名单) | ⚠️ 语义相近 |
| 搜索上下文量 | `search_context_size: low/medium/high` | `content_size: medium/high` | ⚠️ 语义相近 |
| 用户位置 | `user_location` | 不支持 | ❌(OpenAI) / N/A(智谱) |
| 搜索结果返回顺序 | 无 | `result_sequence: before/after` | N/A |
| 返回来源详情 | `include: ["web_search_call.action.sources"]` | `search_result: true` | ⚠️ 机制不同 |
| 自定义搜索 Prompt | 无 | `search_prompt` | N/A |
| 搜索结果在响应中 | `output[]` 中的 `WebSearchCall` item | 顶层 `web_search[]` 字段 + `tool_calls[]` | ⚠️ 位置不同 |

**迁移示例：**

OpenAI Responses:
```json
{
  "model": "gpt-5",
  "input": "Who is the current president of France?",
  "tools": [{"type": "web_search"}]
}
```

智谱：
```json
{
  "model": "glm-5.1",
  "messages": [{"role": "user", "content": "Who is the current president of France?"}],
  "tools": [{
    "type": "web_search",
    "web_search": {
      "enable": true,
      "search_engine": "search_pro",
      "search_recency_filter": "oneWeek"
    }
  }]
}
```

### 5.3 File Search → 知识库检索

OpenAI 的 `file_search` 基于 Vector Store，智谱使用**知识库检索（Retrieval）**，基于 `knowledge_id`。

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 数据源 | Vector Store（上传文件到 OpenAI） | 知识库（在智谱平台创建，通过 `knowledge_id` 引用） | ⚠️ 机制不同 |
| 定义方式 | `{"type": "file_search", "vector_store_ids": [...], "filters": {...}}` | `{"type": "retrieval", "retrieval": {"knowledge_id": "..."}}` | ⚠️ 参数不同 |
| 返回条数 | `max_num_results: 1-50` | 无显式控制 | — |
| 分数阈值 | `ranking_options.score_threshold` | 无 | — |
| 属性过滤 | `filters` (ComparisonFilter/CompoundFilter) | 无 | ❌(智谱) |
| 自定义检索 Prompt | 无 | `prompt_template` (含 `{{knowledge}}` 和 `{{question}}` 占位符) | N/A |
| MCP 知识库检索 | — | 可通过 MCP 工具接入外部知识库 | N/A |

**迁移示例：**

OpenAI Responses:
```json
{
  "model": "gpt-5",
  "input": "What is our return policy?",
  "tools": [{
    "type": "file_search",
    "vector_store_ids": ["vs_abc123"],
    "max_num_results": 5
  }]
}
```

智谱：
```json
{
  "model": "glm-5.1",
  "messages": [{"role": "user", "content": "What is our return policy?"}],
  "tools": [{
    "type": "retrieval",
    "retrieval": {
      "knowledge_id": "kb_xyz789",
      "prompt_template": "在文档 {{knowledge}} 中搜索问题 {{question}} 的答案。如果找到答案，仅使用文档中的陈述进行回应；如果没有找到答案，使用你自己的知识回答并告知用户信息不来自文档。"
    }
  }]
}
```

### 5.4 Code Interpreter

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "code_interpreter"}` | ❌ | **不支持** |

**替代方案**：需客户端自行实现沙箱执行循环——解析模型输出的代码块，在沙箱中执行，将结果作为 tool message 传回。

### 5.5 Computer Use

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "computer_use_preview"}` / `{"type": "computer"}` | ❌ | **不支持** |

**替代方案**：需自行实现截图→模型→操作→截图的循环，成本高且工程复杂。

### 5.6 MCP 工具

两者都支持 MCP（Model Context Protocol），但参数形态不同。

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 定义方式 | `{"type": "mcp", "server_label": "...", "server_url": "..."}` | `{"type": "mcp", "mcp": {"server_label": "...", "server_url": "..."}}` | ⚠️ 结构不同（外部 vs 内部标记） |
| 传输类型 | `sse` / `streamable-http` | `sse` / `streamable-http` | ✅ 一致 |
| 工具过滤 | `allowed_tools: ["tool1"]` 或 `{"read_only": true}` | `allowed_tools: ["tool1"]` | ⚠️ 智谱无 read_only 过滤 |
| OAuth 鉴权 | `authorization: "token"` | 无 | ❌(智谱) |
| 自定义 Headers | 无 | `headers: {...}` | N/A |
| 服务连接器 | ✅ (connector_id: Dropbox, Gmail, Google Drive 等) | ❌ | 不支持 |
| 智谱 MCP 服务 | — | 可通过 `server_label` (MCP code) 直接连接智谱托管 MCP，无需 `server_url` | N/A |

**迁移示例：**

OpenAI Responses:
```json
{
  "type": "mcp",
  "server_label": "my-mcp-server",
  "server_url": "https://my-mcp.example.com/mcp",
  "allowed_tools": [{"read_only": true}]
}
```

智谱：
```json
{
  "type": "mcp",
  "mcp": {
    "server_label": "my-mcp-server",
    "server_url": "https://my-mcp.example.com/mcp",
    "transport_type": "streamable-http",
    "allowed_tools": ["tool_a", "tool_b"]
  }
}
```

### 5.7 Image Generation

| 特性 | OpenAI Responses | 智谱 Chat Completions | 状态 |
|------|------|------|------|
| 对话内文生图 | ✅ `{"type": "image_generation"}` | ❌ | **不支持** |

智谱的图像生成需通过独立 API（如 CogView 系列），无法在 Chat Completions 中直接生成。

---

## 6. 多轮对话

### 6.1 范式对比

| | OpenAI Responses | 智谱 Chat Completions |
|------|------|------|
| **Stateful 模式** | `previous_response_id` 自动串联 | 无，需手动拼接 `messages` |
| **Conversation 模式** | `conversation: {id: "..."}` 自动管理 | 无 |
| **Stateless 模式** | 手动拼接 `input` items | 手动拼接 `messages` |
| **加密推理传递** | `include: ["reasoning.encrypted_content"]` | `clear_thinking: false` + 完整透传 `reasoning_content` |

### 6.2 迁移模式

**OpenAI Responses (previous_response_id):**
```python
# 第一轮
res1 = client.responses.create(
    model="gpt-5",
    input="What is the capital of France?",
    store=True
)

# 第二轮：自动继承上下文
res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    previous_response_id=res1.id,
    store=True
)
```

**OpenAI Responses (手动拼接):**
```python
context = [{"role": "user", "content": "What is the capital of France?"}]
res1 = client.responses.create(model="gpt-5", input=context)

# 将第一轮输出追加到上下文
context += res1.output
# 追加新的用户消息
context += [{"role": "user", "content": "And its population?"}]
res2 = client.responses.create(model="gpt-5", input=context)
```

**智谱（手动拼接，与上面手动模式类似）:**
```python
messages = [{"role": "user", "content": "What is the capital of France?"}]
res1 = client.chat.completions.create(model="glm-5.1", messages=messages)

# 追加 assistant 回复
messages.append(res1.choices[0].message.model_dump())
# 追加新的用户消息
messages.append({"role": "user", "content": "And its population?"})
res2 = client.chat.completions.create(model="glm-5.1", messages=messages)
```

### 6.3 工具调用的多轮处理差异

**OpenAI Responses（Item 流）：**
```python
# 第一轮：用户问 + 函数调用
res1 = client.responses.create(
    model="gpt-5",
    input=[{"role": "user", "content": "北京天气怎么样？"}],
    tools=[weather_tool]
)
# output: [FunctionCall(call_id="fc_1", name="get_weather", ...)]

# 第二轮：提交函数结果 + 继续对话
res2 = client.responses.create(
    model="gpt-5",
    input=[
        *res1.output,  # 包含 FunctionCall item
        {"type": "function_call_output", "call_id": "fc_1", "output": '{"temp": 25}'}
    ]
)
```

**智谱（Message 流）：**
```python
# 第一轮：用户问 + 函数调用
res1 = client.chat.completions.create(
    model="glm-5.1",
    messages=[{"role": "user", "content": "北京天气怎么样？"}],
    tools=[weather_tool]
)
# assistant message 包含 tool_calls

# 第二轮：提交函数结果 + 继续对话
messages = [
    {"role": "user", "content": "北京天气怎么样？"},
    res1.choices[0].message.model_dump(),  # assistant message (含 tool_calls)
    {"role": "tool", "tool_call_id": "fc_1", "content": '{"temp": 25}'}
]
res2 = client.chat.completions.create(model="glm-5.1", messages=messages)
```

### 6.4 推理上下文的多轮传递

**OpenAI Responses (ZDR 场景 — 加密推理):**
```python
res1 = client.responses.create(
    model="gpt-5",
    input="复杂数学问题...",
    store=False,
    include=["reasoning.encrypted_content"]
)
# 获取加密的 reasoning item，传递给下一轮
```

**智谱（保留推理）:**
```json
{
  "model": "glm-5.1",
  "messages": [
    // ... 完整的上下文，包含历史 reasoning_content ...
    {"role": "user", "content": "后续问题"}
  ],
  "thinking": {
    "type": "enabled",
    "clear_thinking": false
  }
}
```
> `clear_thinking: false` 会保留历史轮次的 `reasoning_content`。需要确保 messages 中完整、未修改、按原顺序透传历史 `reasoning_content`。

---

## 7. 功能缺口总览

### 快速参考表

| 功能 | 状态 | 替代方案 |
|------|------|------|
| **文本生成** | ✅ 完全支持 | — |
| **图片理解 (Vision)** | ✅ 支持 | `glm-5v-turbo` / `glm-4.6v` 系列 |
| **视频理解** | ✅ 支持 | `glm-5v-turbo` 系列，单视频最大 200M |
| **文件理解** | ✅ 支持 | `glm-5v-turbo` / `glm-4.6v` / `glm-4.5v`，支持 pdf/txt/docx/xlsx/pptx |
| **音频对话** | ✅ 支持 | `glm-4-voice`，输入 wav/mp3，时长 ≤ 10 分钟 |
| **Function Calling** | ✅ 支持 | 结构差异见 [5.1](#51-function-工具) |
| **Web Search** | ✅ 支持 | 配置比 OpenAI 更丰富 |
| **知识库检索** | ✅ 支持 | 对应 OpenAI File Search，机制不同 |
| **MCP** | ✅ 支持 | 结构差异见 [5.6](#56-mcp-工具) |
| **流式输出** | ✅ 支持 | — |
| **思考/推理** | ⚠️ 部分支持 | 二元开关 vs effort 级别；无 summary 控制 |
| **结构化输出** | ⚠️ 部分支持 | 仅 `json_object` 模式，无 JSON Schema 约束 |
| **多轮对话** | ⚠️ 功能等价 | 需手动管理上下文，无 `previous_response_id` |
| **多模态混合输入** | ⚠️ 有限支持 | 不支持同时传 `file_url` 和 `image_url`/`video_url` |
| **频率/存在惩罚** | ❌ 不支持 | 通过 temperature/top_p 间接控制 |
| **Logprobs** | ❌ 不支持 | — |
| **Seed (确定性)** | ❌ 不支持 | — |
| **服务端存储 (store)** | ❌ 不支持 | 客户端自行持久化 |
| **Conversation 对象** | ❌ 不支持 | 客户端自行实现 |
| **Prompt 模板引用** | ❌ 不支持 | 客户端自行实现变量替换 |
| **Code Interpreter** | ❌ 不支持 | 客户端自行构建沙箱执行循环 |
| **Computer Use** | ❌ 不支持 | 客户端自行构建截图-操作循环 |
| **Image Generation** | ❌ 不支持 | 使用独立图像生成 API |
| **加密推理 (ZDR)** | ❌ 不支持 | 使用 `clear_thinking: false` 保留明文推理 |
| **Verbosity 控制** | ❌ 不支持 | 通过 System Prompt 引导 |
| **后台异步执行** | ❌ 不支持 | 客户端自行实现异步 |
| **上下文自动压缩** | ❌ 不支持 | 客户端自行实现摘要/截断 |
| **服务层级选择** | ❌ 不支持 | — |
| **元数据附加** | ❌ 不支持 | 客户端自行关联 |

### 迁移优先级建议

1. **低成本快速迁移**：仅使用文本生成 + 基础 messages，改动最小
2. **工具调用迁移**：适配 function/web_search/retrieval 的结构差异
3. **高级功能重构**：code interpreter / computer use / stateful context 需客户端实现替代方案
4. **差异化利用**：智谱的 web_search 配置比 OpenAI 更灵活，可充分利用搜索引擎选择、时间范围过滤等功能
