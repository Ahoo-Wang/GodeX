# OpenAI Provider Design

## Overview

Add a generic OpenAI-compatible provider (`openai`) to GodeX that maps the Responses API to the OpenAI Chat Completions API. Any upstream implementing the OpenAI Chat Completions protocol (OpenAI, DeepSeek, Together AI, Ollama, etc.) can be connected by configuring `base_url`.

The Zhipu provider will later be refactored to reuse shared logic extracted from both providers. That refactoring is out of scope for this task.

## Decisions

- **Provider name:** `openai`
- **Scope:** Independent implementation first; shared abstraction later
- **Mapping strategy:** Passthrough — 1:1 field mapping where possible, no adapter-layer capabilities validation
- **Unsupported Responses fields** (`background`, `conversation`, `prompt`, `truncation`, etc.) are simply not mapped; the upstream rejects what it doesn't support
- **Core features:** text conversation, function calling, streaming, reasoning (`reasoning_effort`), structured output (`response_format`), full `tool_choice` modes, `web_search_options`

## File Structure

```
src/providers/openai/
├── index.ts               — exports
├── provider.ts            — OpenAIProvider class
├── factory.ts             — createOpenAIProvider(config)
├── request.ts             — ResponsesContext → ChatCompletionCreateRequest
├── response.ts            — ChatCompletion → ResponseObject
├── response-common.ts     — statusFields + buildResponseObject helpers
├── stream.ts              — OpenAIStreamMapper
├── messages.ts            — Responses input items → ChatCompletionMessageParam[]
├── tools.ts               — Responses tools → ChatCompletionTool[] + tool_choice + web_search_options
├── chat-client.ts         — OpenAIChatClient (Fetcher + Bearer auth)
├── tool-calls.ts          — tool call accumulator → ResponseItem mapping
└── api/
    ├── api.ts             — API decorator class
    ├── index.ts
    └── stream-result-extractor.ts
```

## Request Mapping

`ResponsesContext` → `ChatCompletionCreateRequest` (`src/protocol/openai/completions.ts`).

Direct field mapping:

| Responses API | Chat Completions |
|---|---|
| `model` | `model` |
| `instructions` | Merged into `messages` as `developer` message |
| `input` + session history | `messages` (via `messages.ts`) |
| `tools` | `tools` (via `tools.ts`) |
| `tool_choice` | `tool_choice` (via `tools.ts`) |
| `web_search` tools | `web_search_options` (via `tools.ts`) |
| `stream` | `stream` |
| `temperature` | `temperature` |
| `top_p` | `top_p` |
| `max_output_tokens` | `max_completion_tokens` |
| `reasoning.effort` | `reasoning_effort` |
| `text.format` (json_schema/json_object) | `response_format` |
| `user` | `user` |
| `metadata` | `metadata` |
| `seed` | `seed` |
| `stop` | `stop` |
| `store` | `store` |

No adapter-layer validation for unsupported fields. Passthrough by default.

## Messages Mapping

Responses API input items → `ChatCompletionMessageParam[]`.

Key differences from Zhipu:

- **`developer` role passes through natively** — not downgraded to `system`
- **Multimodal content passes through** — `image_url`, `input_audio`, `file` content parts converted to `ChatCompletionContentPart` types
- **Assistant messages** — support `refusal`, `audio` reference, not just plain text
- **Downgraded tool calls** (`local_shell_call`, `shell_call`, `apply_patch_call`, `custom_tool_call`, `tool_search_call`, `mcp_call`) — same pattern as Zhipu (convert to assistant message with `tool_calls` + function tool message for output). Extracting this into a shared module is deferred.

## Tools Mapping

### Tool definitions

| Responses Tool Type | OpenAI Mapping |
|---|---|
| `function` | `ChatCompletionFunctionTool` — direct passthrough |
| `web_search` / `web_search_*` | `web_search_options` on request body |
| `custom` | `ChatCompletionCustomTool` — direct passthrough |
| `local_shell` / `shell` / `apply_patch` | Downgraded to `ChatCompletionFunctionTool` |
| `tool_search` / `namespace` | Downgraded to function tool |
| `file_search` / `mcp` | Skipped |

### Tool choice

| Responses `tool_choice` | OpenAI `tool_choice` |
|---|---|
| `"auto"` | `"auto"` |
| `"none"` | `"none"` |
| `"required"` | `"required"` |
| `{ type: "function", name }` | `{ type: "function", function: { name } }` |
| Other | `"auto"` |

## Response Mapping

`ChatCompletion` → `ResponseObject`.

### Finish reason → status

| `finish_reason` | Response status |
|---|---|
| `stop`, `tool_calls`, `function_call` | `completed` |
| `length` | `incomplete` (reason: `max_output_tokens`) |
| `content_filter` | `incomplete` (reason: `content_filter`) |

### Usage mapping

| Chat Completions `CompletionUsage` | Responses `ResponseUsage` |
|---|---|
| `prompt_tokens` | `input_tokens` |
| `completion_tokens` | `output_tokens` |
| `total_tokens` | `total_tokens` |

### Output items

- `reasoning_content` → `reasoning` item with summary
- `message.content` → `message` item with `output_text` content part
- `message.annotations` → attached to message item
- `message.tool_calls` → `function_call` items

## Stream Mapping

`ChatCompletionChunk` SSE → `ResponseStreamEvent[]`.

Uses the same StreamPhase state machine pattern as Zhipu (HEADERS → CONTENT → DONE):

1. **HEADERS phase** — first chunk triggers `response.created`, `response.in_progress`, `output_item.added`, `content_part.added`
2. **CONTENT phase** — accumulate `delta.content` (text), `delta.refusal`, `delta.tool_calls`, `delta.reasoning_content` (if present, mapped from reasoning models)
3. **DONE phase** — `finish_reason` triggers end events: `output_text.done`, `content_part.done`, `output_item.done`, terminal event (`response.completed` / `response.incomplete` / `response.failed`)

Uses `StreamState` from `src/adapter/mapper/stream-state.ts` for accumulation.

## Chat Client

- Uses `@ahoo-wang/fetcher` + `@ahoo-wang/fetcher-decorator` pattern
- `chat(body)` → POST `{base_url}/chat/completions`
- `streamChat(body)` → POST same endpoint with `stream: true`, returns `ReadableStream<JsonServerSentEvent<ChatCompletionChunk>>`
- Error wrapping: `ExchangeError` → `ProviderError`, `TimeoutError` → `ProviderError` with timeout code

## Provider Registration

Add to `src/providers/builtin.ts`:

```ts
registrar.registerFactory("openai", (config) => createOpenAIProvider(config));
```

### Configuration

```yaml
providers:
  openai:
    base_url: "https://api.openai.com/v1"
    api_key: "${OPENAI_API_KEY}"
```

## Out of Scope

- Zhipu provider refactoring to reuse shared logic
- Shared module extraction (`response-common.ts`, `stream-mapper-base.ts`)
- Audio output generation (passthrough only)
- Image generation
- Computer use
- Responses-only features (`background`, `conversation`, `prompt` templates)
