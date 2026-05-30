---
title: "DeepSeek Reference Implementation"
description: "Walkthrough of the DeepSeek provider — demonstrating native reasoning effort, cached token usage, and content array handling."
keywords: "GodeX, DeepSeek, provider reference, implementation"
---

# DeepSeek Reference Implementation

The DeepSeek provider is one of the bundled reference implementations in GodeX. It demonstrates native reasoning effort support, cached token usage reporting, and defensive content array text extraction.

## Module Structure

```
src/providers/deepseek/
├── spec.ts         # DEEPSEEK_PROVIDER_SPEC declaration with capabilities and accessors
├── client.ts       # createDeepSeekProviderEdge() factory
├── hooks.ts        # Provider-specific hooks (patchRequest, usage mapping, deltas)
├── protocol/       # DeepSeek-specific type definitions
│   ├── completions.ts  # Request/response DTOs including thinking types
│   └── index.ts        # Barrel exports
└── index.ts        # Public exports
```

## Spec Declaration

The `DEEPSEEK_PROVIDER_SPEC` in `spec.ts` declares all capabilities, accessors, and hooks:

```ts
export const DEEPSEEK_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest
> = {
  name: DEEPSEEK_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: DEEPSEEK_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_DEEPSEEK_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: deepSeekFirstChoice,
    finishReason: deepSeekFinishReason,
    outputText: deepSeekOutputText,
    usage: deepSeekResponseUsage,
  },
  stream: { deltas: deepSeekStreamDeltas },
  hooks: { patchRequest: deepSeekPatchRequest },
};
```

## Capabilities

```ts
const DEEPSEEK_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "safety_identifier", "user", "reasoning", "text.format",
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
  toolChoice: { supported: new Set(["auto", "none", "required", "function"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "native" },
  streaming: { usage: true },
};
```

Notable capability details:

- **Native reasoning effort**: DeepSeek supports `reasoning.effort: "native"`, meaning the bridge maps Responses API effort values to DeepSeek's native `reasoning_effort` parameter.
- **Tool degradation**: Codex built-in tools (`local_shell`, `shell`, `apply_patch`, `custom`, `tool_search`, `namespace`) are degraded to `function` type.
- **Max 128 tools**: DeepSeek accepts up to 128 tools per request.
- **Cached tokens**: DeepSeek reports `prompt_cache_hit_tokens` which are mapped to `input_tokens_details.cached_tokens`.

## Hooks

### `deepSeekPatchRequest`

Transforms the bridge's Chat Completions request for DeepSeek-specific behavior:

1. Maps `reasoning_effort` values: `high` → `high`, `xhigh` → `max`.
2. Sets `thinking: { type: "enabled" }` when reasoning is active or when historical messages contain `reasoning_content`.
3. Sets `thinking: { type: "disabled" }` when no reasoning is needed.

### `deepSeekStreamDeltas`

Extracts typed deltas from DeepSeek's SSE chunks:

- `content` → text delta
- `reasoning_content` → reasoning delta
- `tool_calls` → tool call deltas (via shared `mapCommonChatStreamDelta`)
- `usage` → usage delta (with cached token mapping)
- `finish_reason` → finish reason delta

### `mapDeepSeekSpecUsage`

Maps DeepSeek's usage format to the standard `ResponseUsage` type, including:

- `prompt_cache_hit_tokens` → `input_tokens_details.cached_tokens`
- `completion_tokens_details.reasoning_tokens` → `output_tokens_details.reasoning_tokens`

## Client Construction

The `createDeepSeekProviderEdge()` function in `client.ts` builds the `ProviderEdge`:

1. Creates a `ChatProviderClient` with the provider's base URL, API key, and timeout.
2. Uses `createProviderEdge()` from the bridge kernel to wrap the spec, config, and HTTP methods.

## Registration

The provider is registered in `src/providers/builtin.ts`:

```ts
export const DEEPSEEK_PROVIDER_DEFINITION = createProviderDefinition(
  DEEPSEEK_PROVIDER_NAME,
  createDeepSeekProviderEdge,
);
```

The default DeepSeek base URL is `https://api.deepseek.com`. The default model is `deepseek-v4-pro`.

## Content Handling

DeepSeek may return `message.content` as either a string or an array of content parts. The `deepSeekOutputText` accessor handles both cases, extracting text from `type: "text"` parts in array content.

[MiniMax Reference](/03-provider-development/minimax-reference)
[Zhipu Reference](/03-provider-development/zhipu-reference)
