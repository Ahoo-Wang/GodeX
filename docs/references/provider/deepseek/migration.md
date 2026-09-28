# Responses API → DeepSeek Chat Completions API 迁移指南

> **文档定位**：本文档帮助已熟悉 OpenAI Responses API 的开发者，将其代码适配到 DeepSeek Chat Completions API。由于 DeepSeek 当前未提供原生 Responses API，本文档提供字段级映射、范式转换指南和功能缺口分析。

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

### DeepSeek Chat Completions API 定位

DeepSeek 提供的是 **OpenAI 兼容的 Chat Completions 范式** API（`POST /chat/completions`），在以下方面与 Responses API 存在范式差异：

- 使用 `messages` 数组而非 `input` Items
- 工具调用嵌入在 assistant message 的 `tool_calls` 字段中
- 多轮对话需手动管理上下文
- 不支持 `previous_response_id` 链式调用

**DeepSeek 的差异化优势：**

| 特性 | 说明 |
|------|------|
| **思考模式 (Thinking Mode)** | 原生支持思维链输出，通过 `reasoning_content` 返回推理过程，可显著提升复杂推理任务准确性 |
| **思考强度控制** | 支持 `reasoning_effort: "high"/"max"` 两级控制，兼容 OpenAI 的 effort 语义 |
| **工具调用 + 思考** | 思考模式下支持完整的多轮工具调用，且要求回传 `reasoning_content` 以保持推理连续性 |
| **前缀续写 (Beta)** | 支持 `prefix: true` 强制模型以指定前缀开始回答，适用于对话续写场景 |
| **KVCache 隔离** | 通过 `user_id` 实现缓存隔离与隐私管理 |
| **缓存命中统计** | 响应中返回 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 便于成本分析 |
| **兼容性优先** | 对不支持的参数（temperature, top_p 等）静默忽略而非报错，降低迁移成本 |

**本指南的目标是将 Responses API 的思维模型映射到 DeepSeek 的实现上。**

---

## 2. 端点与认证

### 端点映射

| | OpenAI Responses | DeepSeek Chat Completions |
|------|------|------|
| **方法** | `POST` | `POST` |
| **路径** | `/v1/responses` | `/chat/completions` |
| **Base URL** | `https://api.openai.com` | `https://api.deepseek.com` |
| **Beta 前缀续写** | — | `https://api.deepseek.com/beta` |

### 认证头

| | OpenAI | DeepSeek |
|------|------|------|
| **Header** | `Authorization: Bearer $OPENAI_API_KEY` | `Authorization: Bearer $DEEPSEEK_API_KEY` |
| **Key 获取** | [OpenAI Platform](https://platform.openai.com/api-keys) | [DeepSeek Platform](https://platform.deepseek.com/api_keys) |

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

**DeepSeek（等价调用）:**
```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $DEEPSEEK_API_KEY" \
  -d '{
    "model": "deepseek-v4-pro",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## 3. 请求参数映射

### 3.1 输入与指令

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `input: string` | `messages[].content` (role: user) | ✅ 支持 | 直接包装为 user message |
| `input: array` | `messages[]` 数组 | ✅ 支持 | 见 [Item → Message 映射](#4-item--message-映射) |
| `instructions: string` | `messages[].content` (role: system) | ✅ 支持 | 直接作为 system message 插入 |
| `prompt` (模板引用) | 无 | ❌ 不支持 | 需客户端自行实现模板变量替换 |

**注意**：Responses API 中 `instructions` 不和 `previous_response_id` 一起传递到下一轮，这简化了 system message 的替换。DeepSeek 需要在每轮请求中显式设置 system message。

**类型标记差异**：OpenAI Responses 中 `function_call` 使用**内部标记**（type 在对象内部），而 Chat Completions 使用**外部标记**（type 在包裹层）。DeepSeek 沿用了 Chat Completions 的外部标记方式。

**`strict` 默认值差异**：Responses API 中 function 定义默认 `strict: true`，Chat Completions 中默认非 strict。DeepSeek 支持 `strict: true`（Beta），默认 `false`。

### 3.2 模型选择

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `model: string` | `model: string` | ✅ 支持 | 模型名不同，见下方模型对照 |

**模型对照建议：**

| OpenAI 模型 | DeepSeek 推荐模型 | 说明 |
|------|------|------|
| `gpt-5.4` / `gpt-5` | `deepseek-v4-pro` | 最新旗舰，复杂推理、Agent 场景 |
| `gpt-5-mini` / `gpt-5-nano` | `deepseek-v4-flash` | 快速推理、高并发场景 |
| `o3` / `o4-mini` | `deepseek-v4-pro` (开启 thinking) | 深度推理，思考模式 |
| `gpt-4o` | `deepseek-v4-pro` | 通用多模态（注：DeepSeek 当前仅支持文本） |
| `gpt-5-codex` | `deepseek-v4-pro` (开启 thinking) | 代码生成与推理 |

### 3.3 文本生成控制

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `temperature` | `temperature` | ⚠️ 条件支持 | 非思考模式下可用，范围 `[0, 2]`，默认 `1`。**思考模式下传入不生效（不会报错）** |
| `top_p` | `top_p` | ⚠️ 条件支持 | 非思考模式下可用，范围 `[0, 1]`，默认 `1`。**思考模式下传入不生效（不会报错）** |
| `max_output_tokens` | `max_tokens` | ✅ 支持 | 语义一致，参数名不同。取值范围与默认值因模型而异 |
| `text.verbosity` | 无 | ❌ 不支持 | DeepSeek 无独立 verbosity 控制，可通过 system prompt 引导 |
| `stop` (内联在 text 中) | `stop` (顶层) | ✅ 支持 | 字符串或最多 16 个字符串的数组 |
| `truncation` | 无 | ❌ 不支持 | DeepSeek 无自动截断策略配置 |
| `frequency_penalty` | 无（已废弃） | ❌ 不支持 | DeepSeek 已不再支持该参数，传入不生效 |
| `presence_penalty` | 无（已废弃） | ❌ 不支持 | DeepSeek 已不再支持该参数，传入不生效 |

### 3.4 推理 / 思考

这是 DeepSeek 与 OpenAI 差异最大的区域之一。OpenAI Responses 使用 `reasoning` 对象配置，DeepSeek 使用 `thinking` 对象（需传入 `extra_body`）。

OpenAI Responses:
```json
{
  "reasoning": {
    "effort": "medium",
    "summary": "auto"
  }
}
```

DeepSeek:
```json
{
  "thinking": {"type": "enabled"},
  "reasoning_effort": "high"
}
```

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `reasoning.effort` | `reasoning_effort` + `thinking.type` | ⚠️ 部分支持 | DeepSeek 仅支持 `high` 和 `max` 两级。`low`/`medium` 自动映射为 `high`，`xhigh` 自动映射为 `max`。需同时设置 `thinking: {type: "enabled"}` |
| `reasoning.summary` | `reasoning_content` (响应字段) | ⚠️ 部分支持 | DeepSeek 返回完整 `reasoning_content` 在响应中，但不支持 summary 压缩级别控制 |
| 思考开关 | `thinking.type: "enabled"/"disabled"` | ✅ 支持 | 默认 `enabled`。关闭思考：`thinking: {type: "disabled"}` |
| 加密推理 `reasoning.encrypted_content` | 无 | ❌ 不支持 | DeepSeek 不提供加密推理功能 |

**思考强度映射表：**

| OpenAI reasoning.effort | DeepSeek reasoning_effort | 说明 |
|------|------|------|
| `none` | 不传 `reasoning_effort` + `thinking: {type: "disabled"}` | 关闭思考模式 |
| `minimal` | `"high"` | 兼容映射 |
| `low` | `"high"` | 兼容映射 |
| `medium` | `"high"` | 默认强度 |
| `high` | `"high"` | 标准高强度推理 |
| `xhigh` | `"max"` | 兼容映射，最大推理强度 |

**代码示例：开启思考模式**

OpenAI Responses:
```json
{
  "model": "gpt-5",
  "input": "9.11 and 9.8, which is greater?",
  "reasoning": {"effort": "high", "summary": "detailed"}
}
```

DeepSeek:
```python
from openai import OpenAI
client = OpenAI(
    api_key="<DeepSeek API Key>",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=[{"role": "user", "content": "9.11 and 9.8, which is greater?"}],
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

# 获取思维链内容和最终回答
reasoning_content = response.choices[0].message.reasoning_content
content = response.choices[0].message.content
```

**注意**：`thinking` 参数必须通过 `extra_body` 传递（使用 OpenAI SDK 时），因为它不是标准 Chat Completions API 的参数。

### 3.5 结构化输出

OpenAI Responses 使用 `text.format`，DeepSeek 使用顶层 `response_format`：

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `text.format.type: "json_schema"` | `response_format.type: "json_object"` | ⚠️ 部分支持 | DeepSeek 仅支持 `json_object` 模式，不支持完整 JSON Schema 约束 |
| `text.format.name` | 无 | ❌ 不支持 | DeepSeek 无 schema 命名 |
| `text.format.schema` | 无 | ❌ 不支持 | DeepSeek 无 strict schema 验证。需在 prompt 中详细描述期望的 JSON 结构 |
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

DeepSeek（JSON mode + Prompt 约束）:
```json
{
  "model": "deepseek-v4-pro",
  "messages": [{
    "role": "user",
    "content": "Jane, 54 years old\n\n请以 JSON 格式返回以下结构，不要返回其他内容：\n{\n  \"name\": \"姓名 (string)\",\n  \"age\": 年龄 (number, 0-130)\n}\n必须包含 name 和 age 字段，不允许额外字段。"
  }],
  "response_format": {"type": "json_object"}
}
```

### 3.6 流式输出

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `stream: true` | `stream: true` | ✅ 支持 | 两者均使用 SSE，以 `data: [DONE]` 结束 |
| `stream_options.include_usage` | `stream_options.include_usage` | ✅ 支持 | 在 `[DONE]` 前额外返回含 `usage` 的 chunk |
| `stream_options.include_obfuscation` | 无 | ❌ 不支持 | DeepSeek 无流式混淆化选项 |

**流式响应结构差异：**

OpenAI Responses 流式事件：
- `response.created`
- `response.in_progress`
- `response.output_item.added`
- `response.content_part.added`
- `response.output_text.delta`
- `response.completed`

DeepSeek 流式块：
- 标准 SSE delta chunk，包含 `choices[0].delta.content`
- 思考内容在 `choices[0].delta.reasoning_content`
- 思考内容流式块中 `content` 为 `null`，最终回答块中 `reasoning_content` 为 `null`

**思考模式流式处理示例：**

```python
from openai import OpenAI
client = OpenAI(
    api_key="<DeepSeek API Key>",
    base_url="https://api.deepseek.com"
)

messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    stream=True,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

reasoning_content = ""
content = ""

for chunk in response:
    if chunk.choices[0].delta.reasoning_content:
        reasoning_content += chunk.choices[0].delta.reasoning_content
    elif chunk.choices[0].delta.content:
        content += chunk.choices[0].delta.content
```

### 3.7 管理与安全

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `store` | 无 | ❌ 不支持 | DeepSeek 无服务端存储/检索。需客户端自行持久化 |
| `previous_response_id` | 无 | ❌ 不支持 | DeepSeek 无链式 ID 引用。需手动拼接上下文 |
| `conversation` | 无 | ❌ 不支持 | DeepSeek 无 Conversation 对象 |
| `metadata` | 无 | ❌ 不支持 | DeepSeek 无元数据附加 |
| `safety_identifier` | `user_id` | ⚠️ 功能相似 | DeepSeek 提供 `user_id` 用于终端用户标识（最大 512 字符，字符集 `[a-zA-Z0-9\-_]`）、KVCache 缓存隔离和内容安全处理。**不要在 user_id 中包含用户隐私信息** |
| `prompt_cache_key` | 无 | ❌ 不支持 | DeepSeek 无显式缓存键控制 |
| `prompt_cache_retention` | 无 | ❌ 不支持 | DeepSeek 自动缓存，响应中通过 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` 反馈命中情况 |
| `service_tier` | 无 | ❌ 不支持 | DeepSeek 无服务层级选择 |
| `background` | 无 | ❌ 不支持 | DeepSeek 无后台异步执行 |
| `max_tool_calls` | 无 | ❌ 不支持 | DeepSeek 无工具调用次数上限控制 |
| `parallel_tool_calls` | 无（默认并行） | ⚠️ 无显式控制 | DeepSeek 无显式并行开关 |
| `context_management` | 无 | ❌ 不支持 | DeepSeek 无自动压缩配置 |

### 3.8 其他参数

| Responses 参数 | DeepSeek 参数 | 状态 | 说明 |
|------|------|------|------|
| `n` | 无 | ❌ 不支持 | Responses 已移除此参数，DeepSeek 也不支持多 choice 生成 |
| `seed` | 无 | ❌ 不支持 | DeepSeek 无确定性种子 |
| `logprobs` | `logprobs` | ✅ 支持 | 返回输出 token 的对数概率 |
| `top_logprobs` | `top_logprobs` | ✅ 支持 | 0-20，指定每个位置返回 top N 的 token 概率 |
| `frequency_penalty` | 无（已废弃） | ❌ 不支持 | DeepSeek 已不再支持 |
| `presence_penalty` | 无（已废弃） | ❌ 不支持 | DeepSeek 已不再支持 |

**DeepSeek 特有参数：**

| DeepSeek 参数 | 说明 | 对应 Responses |
|------|------|------|
| `thinking.type` | 思考模式开关：`enabled` / `disabled`，默认 `enabled` | 无直接对应（需通过 `extra_body` 传递） |
| `user_id` | 终端用户标识，用于缓存隔离和内容安全，最大 512 字符 | 类似 `safety_identifier` |
| `prefix` (Beta) | 强制模型以指定 assistant message 前缀开始回答，需使用 `base_url="https://api.deepseek.com/beta"` | 无对应 |
| `reasoning_content` (Beta, 输入) | 前缀续写模式下，作为最后一条 assistant 消息思维链内容的输入 | 无对应 |

---

## 4. Item → Message 映射

Responses API 的核心范式是 **Item 联合类型**，每个 Item 是一个独立的语义单元。DeepSeek 使用 **Messages 数组**，工具调用嵌入在 assistant message 内部。

### 4.1 输入侧：Item 类型到 Message 的转换

| Responses Item 类型 | DeepSeek Message 角色 | 转换方式 |
|------|------|------|
| `EasyInputMessage {"role": "user", "content": "..."}` | `{"role": "user", "content": "..."}` | 直接映射 |
| `EasyInputMessage {"role": "system", "content": "..."}` | `{"role": "system", "content": "..."}` | 直接映射 |
| `EasyInputMessage {"role": "developer", "content": "..."}` | `{"role": "system", "content": "..."}` | developer → system（DeepSeek 不支持 developer role） |
| `EasyInputMessage {"role": "assistant", "content": "..."}` | `{"role": "assistant", "content": "..."}` | 直接映射（历史回复） |
| `Message {"role": "user", "content": [{type: "input_text", text: "..."}, {type: "input_image", image_url: "..."}]}` | `{"role": "user", "content": [...]}` | 多部分内容直接映射（注：DeepSeek 当前仅支持文本输入） |
| `FunctionCallOutput {"call_id": "...", "output": "..."}` | `{"role": "tool", "tool_call_id": "...", "content": "..."}` | 转为 tool message |
| `ComputerCallOutput` | — | ❌ 不支持 |
| `WebSearchCall` (作为输入) | — | ❌ 不支持（DeepSeek 无原生 web search 工具） |
| `FileSearchCall` (作为输入) | — | ❌ 不支持（DeepSeek 无原生 file search 工具） |
| `Reasoning` (加密推理 item) | `reasoning_content` (字段) | ⚠️ 仅思考模式下，通过 message 的 `reasoning_content` 字段传递 |

### 4.2 输出侧：Response Output 到 Message 的转换

| Responses Output 类型 | DeepSeek 响应位置 | 转换方式 |
|------|------|------|
| `ResponseOutputMessage` (type: "message", role: "assistant") | `choices[0].message` | 直接映射 |
| `FunctionCall` (type: "function_call") | `choices[0].message.tool_calls[]` | 从独立 item 转为 message 内的 tool_calls 数组 |
| `WebSearchCall` (type: "web_search_call") | — | ❌ 不支持 |
| `FileSearchCall` (type: "file_search_call") | — | ❌ 不支持 |
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

**DeepSeek：**
```python
# 请求
response = client.chat.completions.create(
    model="deepseek-v4-pro",
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

1. **函数定义结构**：Responses 使用内部标记（`{"type": "function", "name": "...", "parameters": {...}}`），DeepSeek 使用外部标记（`{"type": "function", "function": {"name": "...", "parameters": {...}}}`）
2. **函数调用结果**：Responses 中是独立的 `function_call` item 和 `function_call_output` item，DeepSeek 中 `tool_calls` 在 assistant message 内，结果通过 `role: "tool"` message 提交
3. **strict 默认值**：Responses 默认 `strict: true`，DeepSeek 支持 `strict: true`（Beta）但默认 `false`
4. **思考模式下的特殊规则**：工具调用回合产生的 `reasoning_content` **必须**在后续请求中完整回传，否则 API 返回 400 错误。详见 [6.3 思考模式下的上下文拼接](#63-思考模式下的上下文拼接)

---

## 5. 工具映射

### 5.1 Function 工具

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 定义位置 | `tools[]` 顶层数组 | `tools[]` 顶层数组 | ✅ 一致 |
| 最大函数数 | — | 128 个 | — |
| 函数定义结构 | 内部标记：`{"type": "function", "name": "...", "parameters": {...}}` | 外部标记：`{"type": "function", "function": {"name": "...", "parameters": {...}}}` | ⚠️ 结构不同 |
| strict 模式 | 默认 `true` | 支持（Beta），默认 `false` | ⚠️ 默认值不同 |
| tool_choice: auto | ✅ | ✅ (默认) | ✅ 一致 |
| tool_choice: required | ✅ | ✅ | ✅ 支持 |
| tool_choice: none | ✅ | ✅ | ✅ 支持 |
| tool_choice: 指定函数 | ✅ | ✅ | ✅ 支持 `{"type": "function", "function": {"name": "my_function"}}` |
| 并行工具调用 | `parallel_tool_calls: true` | 默认并行，无显式控制 | ⚠️ |
| 思考模式下工具调用 | 自动处理 | 必须回传 `reasoning_content` | ⚠️ 关键差异 |

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

DeepSeek：
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

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "web_search"}` | ❌ | **不支持** |

**替代方案**：需自行实现 web search 作为 custom function tool —— 客户端实现搜索逻辑，将搜索结果作为 tool result 传回模型。

```python
# 自定义 web_search 函数工具
tools = [{
    "type": "function",
    "function": {
        "name": "web_search",
        "description": "Search the web for information",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"}
            },
            "required": ["query"]
        }
    }
}]

# 在客户端实现搜索逻辑并传回结果
def handle_tool_call(tool_call):
    if tool_call.function.name == "web_search":
        query = json.loads(tool_call.function.arguments)["query"]
        results = your_search_function(query)
        return {
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(results)
        }
```

### 5.3 File Search → 无原生支持

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "file_search"}` | ❌ | **不支持** |

**替代方案**：需自行实现 RAG 流水线 —— 在客户端完成文档分块、向量化、检索，将检索结果作为上下文注入 system prompt 或 user message。

### 5.4 Code Interpreter

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "code_interpreter"}` | ❌ | **不支持** |

**替代方案**：需客户端自行实现沙箱执行循环 —— 解析模型输出的代码块，在沙箱中执行，将结果作为 tool message 传回。

### 5.5 Computer Use

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "computer_use_preview"}` / `{"type": "computer"}` | ❌ | **不支持** |

**替代方案**：需自行实现截图→模型→操作→截图的循环，成本高且工程复杂。

### 5.6 MCP 工具

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 整体支持 | ✅ `{"type": "mcp"}` | ❌ | **不支持** |

**替代方案**：需客户端自行实现 MCP 协议交互，将 MCP 工具转换为 DeepSeek function tools 定义，自行处理工具调用和结果返回。

### 5.7 Image Generation

| 特性 | OpenAI Responses | DeepSeek Chat Completions | 状态 |
|------|------|------|------|
| 对话内文生图 | ✅ `{"type": "image_generation"}` | ❌ | **不支持** |

**替代方案**：需自行调用独立图像生成 API（如 DALL·E、Stable Diffusion 等）。

---

## 6. 多轮对话

### 6.1 范式对比

| | OpenAI Responses | DeepSeek Chat Completions |
|------|------|------|
| **Stateful 模式** | `previous_response_id` 自动串联 | 无，需手动拼接 `messages` |
| **Conversation 模式** | `conversation: {id: "..."}` 自动管理 | 无 |
| **Stateless 模式** | 手动拼接 `input` items | 手动拼接 `messages` |
| **加密推理传递** | `include: ["reasoning.encrypted_content"]` | 不适用（无加密推理） |

### 6.2 Stateless 多轮对话（标准模式）

这是 DeepSeek 的推荐模式，手动管理 `messages` 数组：

**OpenAI Responses (previous_response_id 模式):**
```python
res1 = client.responses.create(
    model="gpt-5",
    input="What is the capital of France?",
    store=True
)

res2 = client.responses.create(
    model="gpt-5",
    input="And its population?",
    previous_response_id=res1.id,
    store=True
)
```

**DeepSeek（手动拼接 messages）:**
```python
messages = [
    {"role": "user", "content": "What is the capital of France?"}
]

res1 = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages
)

# 将 assistant 回复加入上下文
messages.append(res1.choices[0].message)

# 添加下一轮用户消息
messages.append({"role": "user", "content": "And its population?"})

res2 = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages
)
```

### 6.3 思考模式下的上下文拼接

这是 DeepSeek 与 OpenAI Responses API 差异最大的行为之一，**必须正确理解**。

#### 规则总结

| 场景 | reasoning_content 是否需要回传 | 说明 |
|------|------|------|
| 普通对话（无工具调用） | **不需要** | 下一轮中可忽略，API 会自动忽略传入的 reasoning_content |
| 工具调用回合 | **必须回传** | 所有后续请求中必须完整携带 reasoning_content，否则返回 400 错误 |

#### 无工具调用的多轮对话

```
Turn 1: User → Assistant (含 reasoning_content + content)
Turn 2: User → Assistant (无需传 Turn 1 的 reasoning_content)
```

```python
from openai import OpenAI
client = OpenAI(
    api_key="<DeepSeek API Key>",
    base_url="https://api.deepseek.com"
)

# Turn 1
messages = [{"role": "user", "content": "9.11 and 9.8, which is greater?"}]
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)

# Turn 2: reasoning_content 无需回传，API 自动忽略
messages.append(response.choices[0].message)
messages.append({"role": "user", "content": "How many Rs are there in the word 'strawberry'?"})
response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages,
    reasoning_effort="high",
    extra_body={"thinking": {"type": "enabled"}}
)
```

#### 有工具调用的多轮对话

```
Turn 1: User → (思考+工具调用+思考+工具调用+...+思考+最终回答)
Turn 2: 后续所有请求必须携带 Turn 1 中产生的所有 reasoning_content
```

```python
import json
from openai import OpenAI

client = OpenAI(
    api_key="<DeepSeek API Key>",
    base_url="https://api.deepseek.com"
)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get weather of a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"},
                    "date": {"type": "string"}
                },
                "required": ["location", "date"]
            }
        }
    }
]

def run_turn(turn, messages):
    """执行一轮对话，自动处理工具调用循环"""
    sub_turn = 1
    while True:
        response = client.chat.completions.create(
            model="deepseek-v4-pro",
            messages=messages,
            tools=tools,
            reasoning_effort="high",
            extra_body={"thinking": {"type": "enabled"}}
        )
        messages.append(response.choices[0].message)

        tool_calls = response.choices[0].message.tool_calls

        # 无工具调用 = 最终回答，结束循环
        if tool_calls is None:
            break

        # 执行工具调用
        for tool in tool_calls:
            result = execute_tool(tool)
            messages.append({
                "role": "tool",
                "tool_call_id": tool.id,
                "content": result
            })
        sub_turn += 1

# Turn 1
messages = [{"role": "user", "content": "How's the weather in Hangzhou tomorrow?"}]
run_turn(1, messages)

# Turn 2: messages 中已包含 Turn 1 的所有 reasoning_content
# （因为 messages.append(response.choices[0].message) 自动携带了 reasoning_content）
messages.append({"role": "user", "content": "How's the weather in Guangzhou tomorrow?"})
run_turn(2, messages)
```

**关键点**：`response.choices[0].message` 是一个完整对象，包含了 `content`、`reasoning_content`、`tool_calls` 等所有字段。直接 `messages.append(response.choices[0].message)` 即可正确携带所有必要信息。

手动构造时等价于：
```python
messages.append({
    "role": "assistant",
    "content": response.choices[0].message.content,
    "reasoning_content": response.choices[0].message.reasoning_content,
    "tool_calls": response.choices[0].message.tool_calls
})
```

### 6.4 前缀续写 (Prefix Completion, Beta)

DeepSeek 提供独特的前缀续写功能，允许强制模型以指定文本开始回答。这在以下场景特别有用：
- 对话续写
- 引导模型以特定格式开头
- 强制模型继续之前的推理方向

```python
client = OpenAI(
    api_key="<DeepSeek API Key>",
    base_url="https://api.deepseek.com/beta"  # 必须使用 beta 端点
)

messages = [
    {"role": "user", "content": "写一首关于春天的五言绝句"}
]

# 强制模型以指定前缀开始回答
messages.append({
    "role": "assistant",
    "content": "春风拂柳绿，",
    "prefix": True
})

response = client.chat.completions.create(
    model="deepseek-v4-pro",
    messages=messages
)
# 模型将从 "春风拂柳绿，" 之后继续生成
```

**思考模式下的前缀续写**：可同时设置 `prefix: true` 和提供 `reasoning_content` 作为最后一条 assistant 消息思维链内容的输入。

---

## 7. 功能缺口总览

### 7.1 快速对照表

| 功能 | OpenAI Responses | DeepSeek Chat Completions | 迁移建议 |
|------|------|------|------|
| 文本生成 | ✅ | ✅ | 直接迁移 |
| 多轮对话 (stateless) | ✅ | ✅ | 手动拼接 messages |
| 多轮对话 (stateful) | ✅ `previous_response_id` | ❌ | 手动管理上下文 |
| 思考/推理 | ✅ `reasoning.effort` | ✅ `thinking` + `reasoning_effort` | 参数格式不同，需适配 |
| 思考强度微调 | ✅ none/minimal/low/medium/high/xhigh | ⚠️ 仅 high/max | low/medium→high, xhigh→max |
| 加密推理 | ✅ `reasoning.encrypted_content` | ❌ | 不支持 |
| 推理摘要控制 | ✅ `reasoning.summary` | ❌ | 不支持 |
| 工具调用 (Function) | ✅ 内部标记 | ✅ 外部标记 | 结构不同，需适配 |
| 工具调用 strict | ✅ 默认 true | ⚠️ Beta，默认 false | 显式设置 `strict: true` |
| Web Search | ✅ 原生 | ❌ | 自定义 function tool 实现 |
| File Search | ✅ 原生 | ❌ | 客户端 RAG 实现 |
| Code Interpreter | ✅ 原生 | ❌ | 客户端沙箱实现 |
| Computer Use | ✅ 原生 | ❌ | 不支持 |
| MCP | ✅ 原生 | ❌ | 客户端 MCP 协议实现 |
| Image Generation | ✅ 原生 | ❌ | 独立 API 调用 |
| Image Input | ✅ | ❌ | DeepSeek 仅支持文本 |
| Audio Input/Output | ✅ / 即将支持 | ❌ | 不支持 |
| 结构化输出 (JSON Schema) | ✅ `text.format.type: "json_schema"` | ⚠️ 仅 `json_object` | prompt 约束替代 |
| 结构化输出 strict | ✅ | ❌ | prompt 描述替代 |
| 流式输出 | ✅ 丰富事件 | ✅ 标准 SSE | 响应解析不同 |
| 流式思考内容 | 通过 reasoning item | `delta.reasoning_content` | 解析位置不同 |
| 元数据 | ✅ `metadata` | ❌ | 客户端管理 |
| 服务端存储 | ✅ `store` | ❌ | 客户端持久化 |
| Conversation 管理 | ✅ `conversation` | ❌ | 客户端管理 |
| 后台执行 | ✅ `background` | ❌ | 不支持 |
| 上下文压缩 | ✅ `context_management` | ❌ | 不支持 |
| Logprobs | 通过 `include` | ✅ `logprobs` + `top_logprobs` | 参数不同 |
| 缓存控制 | ✅ `prompt_cache_key` / `prompt_cache_retention` | ⚠️ 自动缓存 + `prompt_cache_hit_tokens` 反馈 | 无显式控制 |
| 用户标识 | ✅ `safety_identifier` | ✅ `user_id` | 功能相似 |
| 温度/概率控制 | ✅ | ⚠️ 思考模式下不生效 | 非思考模式可用 |
| 频率/存在惩罚 | ✅ | ❌（已废弃） | 不支持 |
| 停止词 | ✅ `stop` (内联 text) | ✅ `stop` (顶层) | 位置不同 |
| 前缀续写 | ❌ | ✅ (Beta) `prefix: true` | DeepSeek 独有 |
| 缓存统计 | 通过 usage details | ✅ `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens` | 更细粒度 |

### 7.2 迁移复杂度分级

| 等级 | 场景 | 迁移工作量 |
|------|------|------|
| 🟢 **低** | 基础文本生成、简单多轮对话 | 改端点 + 改 messages 格式，<1 小时 |
| 🟡 **中** | 函数调用、思考模式、JSON 模式 | 改工具定义结构 + 适配思考参数 + prompt 约束，半天 |
| 🟠 **高** | Web Search 替代、RAG 替代、流式思考 | 需自定义工具实现 + 流式解析适配，1-2 天 |
| 🔴 **极高** | Code Interpreter、Computer Use、MCP | 需完整自建沙箱/循环/协议实现，1 周以上 |
| ⚫ **不可迁移** | 多模态输入（图片/音频）、Image Generation、加密推理 | 需切换到其他服务 |

---

## 参考资料

- [DeepSeek API 文档](https://api-docs.deepseek.com/)
- [DeepSeek 思考模式指南](https://api-docs.deepseek.com/guides/thinking_mode)
- [DeepSeek 工具调用指南](https://api-docs.deepseek.com/guides/tool_calls)
- [DeepSeek 前缀续写 (Beta)](https://api-docs.deepseek.com/guides/chat_prefix_completion)
- [OpenAI Responses API 参考](https://developers.openai.com/api/docs/api-reference/responses)
- [OpenAI Chat Completions → Responses 迁移指南](https://developers.openai.com/api/docs/guides/migrate-to-responses)
