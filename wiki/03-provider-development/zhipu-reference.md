---
title: "Zhipu Reference Implementation"
description: "Walkthrough of the Zhipu provider — a reference implementation that demonstrates all provider interfaces."
keywords: "GodeX, Zhipu, provider reference, implementation"
---

# Zhipu Reference Implementation

The Zhipu provider is one of the bundled reference implementations in GodeX. It demonstrates how to build a complete provider using `ProviderSpec`, `ProviderHooks`, and `ChatProviderClient`, including web search, file search, and MCP tool support.

## Module Structure

```
src/providers/zhipu/
├── spec.ts         # ZHIPU_PROVIDER_SPEC declaration with capabilities and accessors
├── client.ts       # createZhipuProviderEdge() factory
├── hooks.ts        # Provider-specific hooks (patchRequest, usage mapping, deltas)
├── protocol/       # Zhipu-specific type definitions
│   ├── completions.ts  # Request/response DTOs
│   ├── models.ts       # Model list types
│   └── index.ts        # Barrel exports
└── index.ts        # Public exports
```

## Spec Declaration

The `ZHIPU_PROVIDER_SPEC` in `spec.ts` declares all capabilities, accessors, and hooks:

```ts
export const ZHIPU_PROVIDER_SPEC: ProviderSpec<
  BridgeChatCompletionCreateRequest,
  ChatCompletionResponse,
  ChatCompletionChunk,
  ChatCompletionCreateRequest
> = {
  name: ZHIPU_PROVIDER_NAME,
  protocol: CHAT_COMPLETIONS_PROTOCOL,
  capabilities: ZHIPU_SPEC_CAPABILITIES,
  endpoint: { defaultBaseURL: DEFAULT_ZHIPU_BASE_URL },
  auth: BEARER_AUTH,
  toolName: DEFAULT_TOOL_NAME_CODEC,
  response: {
    firstChoice: zhipuFirstChoice,
    finishReason: zhipuFinishReason,
    outputText: zhipuOutputText,
    usage: zhipuResponseUsage,
  },
  stream: { deltas: zhipuStreamDeltas },
  hooks: { patchRequest: zhipuPatchRequest },
};
```

## Capabilities

```ts
const ZHIPU_SPEC_CAPABILITIES: ProviderCapabilities = {
  parameters: {
    supported: new Set([
      "stream", "temperature", "top_p", "max_output_tokens",
      "safety_identifier", "user", "reasoning", "text.format",
    ]),
  },
  tools: {
    supported: new Set([
      "function", "web_search", "web_search_2025_08_26",
      "web_search_preview", "web_search_preview_2025_03_11",
      "file_search", "mcp",
      "local_shell", "shell", "apply_patch",
      "custom", "tool_search", "namespace",
    ]),
    degraded: new Map([
      ["web_search_2025_08_26", "web_search"],
      ["web_search_preview", "web_search"],
      ["web_search_preview_2025_03_11", "web_search"],
      ["file_search", "retrieval"],
      ["local_shell", "function"],
      ["shell", "function"],
      ["apply_patch", "function"],
      ["custom", "function"],
      ["tool_search", "function"],
      ["namespace", "function"],
    ]),
    maxTools: 128,
  },
  toolChoice: { supported: new Set(["auto", "none"]) },
  responseFormats: { supported: new Set(["text", "json_object"]) },
  reasoning: { effort: "boolean" },
  streaming: { usage: true },
};
```

Notable capability details:

- **Boolean reasoning effort**: Zhipu uses `reasoning.effort: "boolean"`, meaning the bridge maps reasoning to a boolean on/off toggle rather than a multi-level effort value.
- **Rich tool support**: Zhipu supports `web_search` (with versioned variants), `file_search` (degraded to `retrieval`), `mcp`, and all standard Codex built-in tools.
- **Limited tool choice**: Only `auto` and `none` are supported — `required` and `function` modes are not available.
- **Max 128 tools**: Zhipu accepts up to 128 tools per request.
- **Cached tokens**: Zhipu reports cached tokens via `prompt_tokens_details.cached_tokens`.

## Hooks

### `zhipuPatchRequest`

Transforms the bridge's Chat Completions request for Zhipu-specific behavior:

1. If `reasoning_effort` is present, removes it from the request (Zhipu uses boolean reasoning).
2. If `thinking` is already configured, merges `clear_thinking: false` to preserve reasoning context.
3. If historical messages contain `reasoning_content`, enables thinking with `clear_thinking: false`.
4. Otherwise, passes the request through as-is.

### `zhipuStreamDeltas`

Extracts typed deltas from Zhipu's SSE chunks:

- `content` → text delta
- `tool_calls` → tool call deltas (via shared `mapCommonChatStreamDelta`)
- `usage` → usage delta (with cached token mapping)
- `finish_reason` → finish reason delta

### `mapZhipuUsage`

Maps Zhipu's usage format to the standard `ResponseUsage` type, including:

- `prompt_tokens_details.cached_tokens` → `input_tokens_details.cached_tokens`

## Client Construction

The `createZhipuProviderEdge()` function in `client.ts` builds the `ProviderEdge`:

1. Creates a `ChatProviderClient` with the provider's base URL, API key, and timeout.
2. Uses `createProviderEdge()` from the bridge kernel to wrap the spec, config, and HTTP methods.

## Registration

The provider is registered in `src/providers/builtin.ts`:

```ts
export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
  ZHIPU_PROVIDER_NAME,
  createZhipuProviderEdge,
);
```

## Base URLs

Zhipu has two base URLs:

| URL | Use Case |
|-----|----------|
| `https://open.bigmodel.cn/api/paas/v4` | Standard API endpoint |
| `https://open.bigmodel.cn/api/coding/paas/v4` | Coding plan endpoint (default) |

The default base URL is the coding plan endpoint. The default model is `glm-5.1`.

[Message & Tool Mapping](/03-provider-development/message-tool-mapping)
[DeepSeek Reference](/03-provider-development/deepseek-reference)
