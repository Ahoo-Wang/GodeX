---
title: "Zhipu Reference Implementation"
description: "Walkthrough of the Zhipu provider — a reference implementation that demonstrates all provider interfaces."
keywords: "GodeX, Zhipu, provider reference, implementation"
---

# Zhipu Reference Implementation

The Zhipu provider is one of the bundled reference implementations in GodeX. It demonstrates how to build a complete provider using `ProviderSpec`, `ProviderHooks`, and `ChatProviderClient`.

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

## Client Construction

The `createZhipuProviderEdge()` function in `client.ts` builds the `ProviderEdge`:

1. Creates a `ChatProviderClient` with the provider's base URL, API key, and timeout.
2. Uses `createProviderEdge()` from the bridge kernel to wrap the spec, config, and HTTP methods.

## Hooks

The `hooks.ts` file contains provider-specific behavior:

- **`zhipuPatchRequest`** — Transforms the bridge's Chat Completions request into Zhipu's native format when needed.
- **`zhipuStreamDeltas`** — Extracts typed deltas from Zhipu's SSE chunks (text, tool calls, usage, finish reason).
- **`mapZhipuUsage`** — Maps Zhipu's usage format to the standard `ResponseUsage` type.

## Registration

The provider is registered in `src/providers/builtin.ts`:

```ts
export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
  ZHIPU_PROVIDER_NAME,
  createZhipuProviderEdge,
);
```

The default Zhipu base URL is `https://open.bigmodel.cn/api/coding/paas/v4` (coding plan endpoint). The default model is `glm-5.1`.

[Message & Tool Mapping](/03-provider-development/message-tool-mapping)
[DeepSeek Reference](/03-provider-development/deepseek-reference)
