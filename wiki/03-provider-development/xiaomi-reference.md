---
title: "Xiaomi Reference Implementation"
description: "Walkthrough of the Xiaomi provider — demonstrating boolean reasoning effort, thinking preservation, and max_completion_tokens request patching."
keywords: "GodeX, Xiaomi, MiMo, provider reference, implementation"
---

# Xiaomi Reference Implementation

The Xiaomi provider integrates the Xiaomi MiMo API (`api.xiaomimimo.com/v1`), an OpenAI-compatible Chat Completions API with native thinking/reasoning support. It demonstrates boolean reasoning effort mapping, multi-turn reasoning content preservation, and `max_tokens` to `max_completion_tokens` request patching.

## Module Structure

```
src/providers/xiaomi/
├── spec.ts         # XIAOMI_PROVIDER_SPEC declaration with capabilities and accessors
├── client.ts       # createXiaomiProviderEdge() factory
├── hooks.ts        # Provider-specific hooks (patchRequest, usage mapping, deltas)
├── protocol/       # Xiaomi-specific type definitions
│   ├── completions.ts  # Request/response DTOs
│   └── index.ts        # Barrel exports
└── index.ts        # Public exports
```

## Spec Declaration

The `XIAOMI_PROVIDER_SPEC` in `spec.ts` declares all capabilities, accessors, and hooks:

```ts
export const XIAOMI_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest
> = {
  name: XIAOMI_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: XIAOMI_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_XIAOMI_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: xiaomiFirstChoice,
    finishReason: xiaomiFinishReason,
    outputText: xiaomiOutputText,
    usage: xiaomiResponseUsage,
  },
  stream: { deltas: xiaomiStreamDeltas },
  hooks: { patchRequest: xiaomiPatchRequest },
};
```

## Capabilities

```ts
const XIAOMI_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "user", "reasoning", "text.format",
    ]),
  },
  tools: {
    supported: new Set([
      "function", "local_shell", "shell", "apply_patch",
      "custom", "tool_search", "namespace",
    ]),
    degraded: new Map([
      ["local_shell", "function"],
      ["shell", "function"],
      ["apply_patch", "function"],
      ["custom", "function"],
      ["tool_search", "function"],
      ["namespace", "function"],
    ]),
    maxTools: 128,
  },
  toolChoice: { supported: new Set(["auto"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "boolean" },
  streaming: { usage: true },
};
```

Notable capability details:

- **Boolean reasoning**: Xiaomi uses `reasoning.effort: "boolean"`, so the bridge maps reasoning effort to `thinking: { type: "enabled"/"disabled" }`.
- **Tool choice limited**: Only `auto` is supported for `tool_choice`.
- **Tool degradation**: Codex built-in tools are degraded to `function` type.
- **Max 128 tools**: Xiaomi accepts up to 128 tools per request.
- **Cached tokens**: Xiaomi reports `prompt_tokens_details.cached_tokens`.
- **Reasoning tokens**: Xiaomi reports `completion_tokens_details.reasoning_tokens`.

## Hooks

### `xiaomiPatchRequest`

Transforms the bridge's Chat Completions request for Xiaomi-specific behavior with three priority levels:

1. **Historical reasoning content** — When `reasoning_content` exists in message history, forces `thinking: { type: "enabled" }` to preserve multi-turn reasoning continuity.
2. **Bridge-set thinking** — When the bridge has already set `thinking` (via boolean effort mapping), preserves it unchanged.
3. **Default disabled** — When no reasoning was requested and no thinking field exists, sets `thinking: { type: "disabled" }`.

Additionally strips `reasoning_effort` (not supported by Xiaomi) and maps `max_tokens` → `max_completion_tokens`.

### `xiaomiStreamDeltas`

Extracts typed deltas from Xiaomi's SSE chunks:

- `content` → text delta
- `tool_calls` → tool call deltas (via shared `mapCommonChatStreamDelta`)
- `usage` → usage delta (with cached token and reasoning token mapping)
- `finish_reason` → finish reason delta

### `mapXiaomiUsage`

Maps Xiaomi's usage format to the standard `ResponseUsage` type, including:

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`
- `completion_tokens_details.reasoning_tokens` → `output_tokens_details.reasoning_tokens`

Both fields are validated with `assertFiniteNumber` — malformed values throw `ProviderError`.

## Client Construction

The `createXiaomiProviderEdge()` function in `client.ts` builds the `ProviderEdge`:

1. Creates a `ChatProviderClient` with the provider's base URL, API key, and timeout.
2. Uses `createProviderEdge()` from the bridge kernel to wrap the spec, config, and HTTP methods.

## Registration

The provider is registered in `src/providers/builtin.ts`:

```ts
export const XIAOMI_PROVIDER_DEFINITION = createProviderDefinition(
  XIAOMI_PROVIDER_NAME,
  createXiaomiProviderEdge,
);
```

The default Xiaomi base URL is `https://api.xiaomimimo.com/v1`. The default model is `mimo-v2.5-pro`. The API key is configured via the `MIMO_API_KEY` environment variable.

## Content Handling

Xiaomi may return `message.content` as either a string or an array of content parts. The `xiaomiOutputText` accessor handles both cases, extracting text from `type: "text"` parts in array content. When `content` is `null` or an unrecognized type, it returns an empty string.

## Models

| Model ID | Description |
|----------|-------------|
| `mimo-v2.5-pro` | Default model, most capable |
| `mimo-v2.5` | High quality model |
| `mimo-v2.5-tts` | Text-to-speech model |
| `mimo-v2-pro` | Previous generation pro model |
| `mimo-v2-omni` | Previous generation multimodal model |
| `mimo-v2-flash` | Fast inference model |

[MiniMax Reference](/03-provider-development/minimax-reference)
[Zhipu Reference](/03-provider-development/zhipu-reference)
[DeepSeek Reference](/03-provider-development/deepseek-reference)
