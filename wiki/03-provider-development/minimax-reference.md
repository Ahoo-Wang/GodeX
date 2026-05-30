---
title: "MiniMax Reference Implementation"
description: "Walkthrough of the MiniMax provider — demonstrating cached token usage, reasoning tokens, and request patching for max_completion_tokens."
keywords: "GodeX, MiniMax, provider reference, implementation"
---

# MiniMax Reference Implementation

The MiniMax provider is one of the bundled reference implementations in GodeX. It demonstrates cached token and reasoning token usage reporting, `max_tokens` to `max_completion_tokens` request patching, and defensive content array text extraction.

## Module Structure

```
src/providers/minimax/
├── spec.ts         # MINIMAX_PROVIDER_SPEC declaration with capabilities and accessors
├── client.ts       # createMiniMaxProviderEdge() factory
├── hooks.ts        # Provider-specific hooks (patchRequest, usage mapping, deltas)
├── protocol/       # MiniMax-specific type definitions
│   ├── completions.ts  # Request/response DTOs
│   └── index.ts        # Barrel exports
└── index.ts        # Public exports
```

## Spec Declaration

The `MINIMAX_PROVIDER_SPEC` in `spec.ts` declares all capabilities, accessors, and hooks:

```ts
export const MINIMAX_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest
> = {
  name: MINIMAX_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: MINIMAX_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_MINIMAX_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: minimaxFirstChoice,
    finishReason: minimaxFinishReason,
    outputText: minimaxOutputText,
    usage: minimaxResponseUsage,
  },
  stream: { deltas: minimaxStreamDeltas },
  hooks: { patchRequest: minimaxPatchRequest },
};
```

## Capabilities

```ts
const MINIMAX_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "user", "text.format",
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
  reasoning: { effort: "none" },
  streaming: { usage: true },
};
```

Notable capability details:

- **No reasoning effort**: MiniMax uses `reasoning.effort: "none"`, meaning the bridge strips `reasoning_effort` from the request entirely.
- **Tool degradation**: Codex built-in tools (`local_shell`, `shell`, `apply_patch`, `custom`, `tool_search`, `namespace`) are degraded to `function` type.
- **Full tool choice**: Supports `auto`, `none`, `required`, and `function` tool choice modes.
- **Max 128 tools**: MiniMax accepts up to 128 tools per request.
- **Cached tokens**: MiniMax reports `prompt_tokens_details.cached_tokens`.
- **Reasoning tokens**: MiniMax reports `completion_tokens_details.reasoning_tokens`.

## Hooks

### `minimaxPatchRequest`

Transforms the bridge's Chat Completions request for MiniMax-specific behavior:

1. Strips `reasoning_effort` from the request (MiniMax does not support it).
2. Maps `max_tokens` → `max_completion_tokens` (MiniMax uses the `max_completion_tokens` parameter name).

### `minimaxStreamDeltas`

Extracts typed deltas from MiniMax's SSE chunks:

- `content` → text delta
- `tool_calls` → tool call deltas (via shared `mapCommonChatStreamDelta`)
- `usage` → usage delta (with cached token and reasoning token mapping)
- `finish_reason` → finish reason delta

### `mapMiniMaxUsage`

Maps MiniMax's usage format to the standard `ResponseUsage` type, including:

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`
- `completion_tokens_details.reasoning_tokens` → `output_tokens_details.reasoning_tokens`

Both fields are validated with `assertFiniteNumber` — malformed values throw `ProviderError`.

## Client Construction

The `createMiniMaxProviderEdge()` function in `client.ts` builds the `ProviderEdge`:

1. Creates a `ChatProviderClient` with the provider's base URL, API key, and timeout.
2. Uses `createProviderEdge()` from the bridge kernel to wrap the spec, config, and HTTP methods.

## Registration

The provider is registered in `src/providers/builtin.ts`:

```ts
export const MINIMAX_PROVIDER_DEFINITION = createProviderDefinition(
  MINIMAX_PROVIDER_NAME,
  createMiniMaxProviderEdge,
);
```

The default MiniMax base URL is `https://api.minimaxi.com/v1`. The default model is `MiniMax-M2.7`.

## Content Handling

MiniMax may return `message.content` as either a string or an array of content parts. The `minimaxOutputText` accessor handles both cases, extracting text from `type: "text"` parts in array content. When `content` is `null` or an unrecognized type, it returns an empty string.

## Models

| Model ID | Description |
|----------|-------------|
| `MiniMax-M2.7` | Default model |
| `MiniMax-M2.7-highspeed` | High-speed variant |
| `MiniMax-M2.5` | Previous generation |
| `MiniMax-M2.1` | Earlier generation |

[Zhipu Reference](/03-provider-development/zhipu-reference)
[DeepSeek Reference](/03-provider-development/deepseek-reference)
