> ## Documentation Index
> Fetch the complete documentation index at: https://platform.xiaomimimo.com/docs/llms.txt
> Use this file to discover all available pages before exploring further.

# OpenAI API 兼容

> 使用 OpenAI API 兼容格式接口调用小米 MiMo 模型，支持对话补全、流式输出、函数调用、联网搜索、深度思考等场景。

## 请求地址

```
https://api.xiaomimimo.com/v1/chat/completions
```

## 认证

接口支持以下两种认证方式：

1. `api-key: $MIMO_API_KEY`
2. `Authorization: Bearer $MIMO_API_KEY`

## 模型列表

| 模型 ID | 说明 |
|---------|------|
| `mimo-v2.5-pro` | 最新旗舰模型（默认） |
| `mimo-v2.5` | 高质量模型 |
| `mimo-v2.5-tts` | 语音合成模型 |
| `mimo-v2.5-tts-voicedesign` | 语音设计模型 |
| `mimo-v2.5-tts-voiceclone` | 语音克隆模型 |
| `mimo-v2-pro` | 上一代 Pro 模型 |
| `mimo-v2-omni` | 上一代多模态模型 |
| `mimo-v2-flash` | 快速推理模型 |
| `mimo-v2-tts` | 上一代语音合成模型 |

## 请求参数

| 参数 | 类型 | 必选 | 说明 |
|------|------|------|------|
| `model` | string | 是 | 模型 ID |
| `messages` | array | 是 | 对话消息列表 |
| `thinking` | object | 否 | `{ type: "enabled"/"disabled" }`，控制思维链 |
| `max_completion_tokens` | integer | 否 | 生成 token 数上限 |
| `temperature` | number | 否 | 采样温度，0-1.5 |
| `top_p` | number | 否 | 核采样阈值，0.01-1.0 |
| `stream` | boolean | 否 | 是否流式输出 |
| `tools` | array | 否 | 工具列表，仅支持 function 类型 |
| `tool_choice` | string | 否 | 仅支持 `auto` |
| `response_format` | object | 否 | `{ type: "text"/"json_object" }` |
| `stop` | string/array | 否 | 停止序列 |
| `frequency_penalty` | number | 否 | 频率惩罚，-2.0 到 2.0 |
| `presence_penalty` | number | 否 | 存在惩罚，-2.0 到 2.0 |

## 完成原因

| 值 | 说明 |
|----|------|
| `stop` | 自然结束或命中停止序列 |
| `length` | 达到 max_completion_tokens 上限 |
| `tool_calls` | 模型调用了工具 |
| `content_filter` | 内容被过滤 |
| `repetition_truncation` | 检测到复读 |

## 用量格式

```json
{
  "usage": {
    "prompt_tokens": 57,
    "completion_tokens": 72,
    "total_tokens": 129,
    "prompt_tokens_details": {
      "cached_tokens": 0,
      "audio_tokens": 0,
      "image_tokens": 0,
      "video_tokens": 0
    },
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

## 参考链接

- [小米 MiMo API 文档](https://platform.xiaomimimo.com/docs/zh-CN/api/chat/openai-api)
- [MiMo 开放平台](https://platform.xiaomimimo.com)
