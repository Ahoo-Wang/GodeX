# DeepSeek Provider Design

## Goal

Add `DeepSeekProvider` as a production-ready built-in provider for the OpenAI Responses-to-Chat Completions adapter path.

The first release supports the stable baseline:

- non-stream and stream Chat Completions requests
- text input/output
- function tools and Responses tool-call round trips
- explicit reasoning mapped to DeepSeek thinking mode
- `reasoning_content` mapped into Responses reasoning items
- DeepSeek thinking-plus-tool history replay
- JSON object response format
- usage, prompt cache hit/miss tokens, and reasoning token details
- gated live e2e tests using `DEEPSEEK_API_KEY`

This is not a generic OpenAI-compatible shortcut. DeepSeek has provider-specific semantics around `thinking`, `reasoning_effort`, `reasoning_content`, `tool_choice`, and usage fields, so the provider needs its own mapper modules.

## Sources

DeepSeek behavior is based on the current official API documentation:

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/api/create-chat-completion
- https://api-docs.deepseek.com/guides/thinking_mode
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/quick_start/agent_integrations/oh_my_pi

Important source-derived constraints:

- The OpenAI-format base URL is `https://api.deepseek.com`; do not append `/v1`.
- Chat completion requests use `POST /chat/completions`.
- Current preferred models are `deepseek-v4-flash` and `deepseek-v4-pro`.
- `deepseek-chat` and `deepseek-reasoner` are compatibility aliases that DeepSeek marks for future deprecation. GodeX should not reject them locally because model routing already supports arbitrary provider model names.
- DeepSeek thinking mode defaults to enabled upstream, but GodeX will explicitly disable it unless the Responses request asks for reasoning.
- In thinking mode with tool calls, DeepSeek requires historical assistant messages to retain the `reasoning_content` associated with tool-call turns.
- General Chat Completion docs describe `tool_choice`, but DeepSeek's agent integration docs say V4 thinking mode rejects `tool_choice`. GodeX will not send `tool_choice` while thinking is enabled.

## Non-Goals

- Do not add a new config schema for provider-specific options.
- Do not implement Beta prefix completion.
- Do not force all function tools into DeepSeek strict mode.
- Do not validate DeepSeek model names locally.
- Do not add native web search, file search, code interpreter, MCP, shell, or computer-use support beyond function-tool downgrades already used by compatible providers.
- Do not change `Provider`, `ProviderMapper`, `RequestMapper`, `ResponseMapper`, `StreamMapper`, or shared chat mapper public contracts.
- Do not import `providers/deepseek/*` from `src/adapter/mapper/chat`.

## Provider Layout

Add a new provider directory:

```text
src/providers/deepseek/
├── provider.ts
├── provider-client.ts
├── factory.ts
├── index.ts
├── protocol/
│   ├── completions.ts
│   └── index.ts
└── mapper/
    ├── index.ts
    ├── factory.ts
    ├── capabilities.ts
    ├── compatibility.ts
    ├── messages.ts
    ├── tools.ts
    ├── request-options.ts
    ├── response-output.ts
    ├── usage.ts
    ├── finish-reason.ts
    ├── stream-delta.ts
    └── tool-calls.ts
```

`DeepSeekProvider` follows the same assembly pattern as OpenAI and Zhipu:

- `provider.ts` defines `DEEPSEEK_PROVIDER_NAME = "deepseek"` and `DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"`.
- `provider-client.ts` extends `ChatProviderClient`.
- `factory.ts` creates the provider from the existing `ProviderConfig`.
- `index.ts` exports the provider entry points.
- `src/providers/builtin.ts` registers the `deepseek` factory.
- `src/providers/index.ts` exports the new provider module.

No config schema change is needed. Users configure DeepSeek exactly like other providers:

```yaml
providers:
  deepseek:
    api_key: ${DEEPSEEK_API_KEY}
    base_url: https://api.deepseek.com
```

## Protocol Types

`src/providers/deepseek/protocol/completions.ts` defines DeepSeek-specific request, response, and chunk shapes instead of reusing OpenAI protocol types directly.

The request type includes:

- `model`
- `messages`
- `thinking?: { type: "enabled" | "disabled" }`
- `reasoning_effort?: "high" | "max"`
- `max_tokens`
- `response_format?: { type: "text" | "json_object" }`
- `stop?: string | string[]`
- `stream`
- `stream_options?: { include_usage: boolean }`
- `temperature`
- `top_p`
- `tools`
- `tool_choice`
- `logprobs`
- `top_logprobs`
- `user_id`

The response and stream chunk types include DeepSeek fields that matter to GodeX:

- `message.reasoning_content`
- `delta.reasoning_content`
- `finish_reason: "stop" | "length" | "content_filter" | "tool_calls" | "insufficient_system_resource"`
- `usage.prompt_cache_hit_tokens`
- `usage.prompt_cache_miss_tokens`
- `usage.completion_tokens_details.reasoning_tokens`

The types should be narrow enough to protect mapper logic and broad enough to accept future unknown fields without failing TypeScript unnecessarily.

## Mapper Assembly

`createDeepSeekMapper()` composes the existing shared chat mappers:

```ts
new ChatRequestMapper({
	negotiator: new DeepSeekCompatibilityNegotiator(),
	factory: new DeepSeekRequestFactory(),
	messages: new DeepSeekMessageMapper(),
	tools: new DeepSeekToolMapper(),
	toolChoice: new DeepSeekToolChoiceMapper(),
	options: new DeepSeekRequestOptionsMapper(),
})
```

Response and stream mapping use the same shared composition classes as OpenAI and Zhipu:

- `ChatResponseMapper`
- `ChatStreamMapper`
- shared `response-object-builder`
- shared `StreamResponseState`

DeepSeek-specific policy stays in `src/providers/deepseek/mapper`.

## Compatibility Negotiation

`DeepSeekCompatibilityNegotiator` returns a request-local `CompatibilityPlan` and records diagnostics through `ResponsesContext`.

Hard rejections:

- `background: true`
- `conversation`
- `prompt`

Warn and ignore or degrade:

- `truncation: "auto"` is ignored.
- `parallel_tool_calls` is ignored because DeepSeek does not expose an explicit switch.
- `metadata`, `service_tier`, `prompt_cache_key`, `prompt_cache_retention`, and `text.verbosity` are unsupported upstream parameters and should not be forwarded.
- `store` remains a GodeX session-persistence control. It is consumed by `DefaultAdapter` and is not forwarded to DeepSeek.
- `stream_options.include_obfuscation` is ignored.
- `text.format.type === "json_schema"` is degraded to `response_format: { type: "json_object" }`.
- Unsupported tool types are skipped with diagnostics unless they can be safely downgraded to function tools.
- `tool_choice` is ignored in thinking mode and mapped normally only when thinking is disabled.

Capabilities:

- parameters: `stream`, `temperature`, `top_p`, `max_output_tokens`, `safety_identifier`, `user`, `reasoning`, `text.format`
- tools: function tools plus safe function downgrades for existing Codex-oriented tool shapes
- tool choice: `auto`, `none`, `required`, named function when thinking is disabled
- response formats: `text`, `json_object`, degraded `json_schema`
- reasoning: native two-level effort after mapping
- streaming usage: supported

## Request Mapping

### Thinking Defaults

GodeX should not let DeepSeek's upstream default thinking mode change Responses semantics.

Mapping rules:

- no `request.reasoning` or `reasoning.effort === "none"`: send `thinking: { type: "disabled" }`
- `minimal`, `low`, `medium`, `high`: send `thinking: { type: "enabled" }` and `reasoning_effort: "high"`
- `xhigh`: send `thinking: { type: "enabled" }` and `reasoning_effort: "max"`

When thinking is enabled, temperature and top-p may still be accepted by the API but are documented as ineffective. The first implementation should omit them in thinking mode and add diagnostics if the client supplied them. When thinking is disabled, pass `temperature` and `top_p` through.

### Messages

DeepSeek supports `system`, `user`, `assistant`, and `tool`.

Mapping rules:

- `instructions` becomes a leading `system` message.
- `developer` input messages become `system` messages.
- user and assistant text messages map directly.
- unsupported multimodal content is skipped or rejected according to the current shared message payload behavior for provider-specific mappers.
- function call output becomes `role: "tool"` with `tool_call_id`.
- function call input/history becomes an assistant message with `tool_calls`.

Assistant tool-call messages must include `content`. Use an empty string when there is no assistant text.

### Reasoning Content History Replay

DeepSeek needs a provider-specific history reconstruction step because GodeX stores reasoning as separate Responses `reasoning` items.

When rebuilding messages from `ctx.session.input_items`, `DeepSeekMessageMapper` keeps pending reasoning text and coalesces Responses output items back into the Chat Completions assistant shape that DeepSeek expects:

1. When a `reasoning` item appears, collect its `summary` text and `content` text into a pending reasoning buffer.
2. When an assistant message item appears, keep its output text as pending assistant content until the mapper knows whether function-call items immediately follow.
3. Consecutive `function_call` items after that assistant message are combined into one DeepSeek assistant message with `tool_calls`.
4. If a combined assistant tool-call message is emitted, set `content` to the pending assistant text or `""`, set `reasoning_content` to the pending reasoning text when present, and clear both pending buffers.
5. If the pending assistant message is not followed by function calls, emit it as a normal assistant message and clear pending reasoning because DeepSeek does not require reasoning replay for non-tool turns.
6. Function call output items become `role: "tool"` messages after the assistant tool-call message.

This keeps replay provider-specific and avoids changing the session store.

Current request input arrays get the same treatment as stored session history so stateless multi-turn clients can include previous reasoning and tool-call items explicitly.

### Tools

DeepSeek supports function tools. First-class mapping:

- Responses `function` tools map to DeepSeek `{ type: "function", function: { name, description, parameters } }`.
- `strict` is preserved only when the input tool explicitly provided it. GodeX does not force strict mode because strict requires Beta API/schema constraints.
- function names are validated or encoded to fit DeepSeek's name rule and 64-character limit where existing tool downgrades require it.

Safe downgrades to function tools:

- `local_shell`
- `shell`
- `apply_patch`
- `custom`
- `tool_search`
- `namespace` nested tools

Unsupported native tools such as web search, file search, MCP, code interpreter, image generation, and computer-use are skipped with diagnostics unless an existing safe function downgrade exists. The provider should not pretend DeepSeek has native support for these tools.

### Tool Choice

When thinking is disabled and effective tools exist:

- `auto` -> `auto`
- `none` -> no tools and no `tool_choice`
- `required` -> `required`
- named function -> DeepSeek named function choice
- unsupported choice forms -> degrade to `auto` with diagnostic

When thinking is enabled:

- do not send `tool_choice`
- keep tools available
- record a diagnostic if the client supplied an explicit `tool_choice`

This follows the stricter DeepSeek V4 agent compatibility guidance while preserving normal Chat Completion behavior for non-thinking mode.

### Other Request Options

- `max_output_tokens` -> `max_tokens`
- `stream: true` -> `stream: true` and `stream_options: { include_usage: true }`
- `safety_identifier ?? user` -> `user_id`
- `text.format.type === "json_object"` -> `response_format: { type: "json_object" }`
- `text.format.type === "json_schema"` -> `response_format: { type: "json_object" }` with diagnostic
- no `stop` mapping is added in this feature because the current Responses request type does not expose a top-level stop sequence to provider mappers

## Response Mapping

`DeepSeekResponseAccessor` extracts `choices[0]` and its `finish_reason`.

`DeepSeekResponseOutputMapper` builds:

- a Responses `reasoning` item when `message.reasoning_content` exists
- a completed assistant message item for `message.content`, including empty content when tool calls are present
- one Responses function call item per DeepSeek function `tool_call`

Tool call identity restoration follows the same explicit resolver pattern as existing providers. It restores namespace function names when possible and maps known downgraded built-in tool names back to their Responses call item types.

Empty upstream choices produce a failed Responses object with `server_error` and message `Empty choices from upstream`, matching the current provider pattern.

## Finish Reason Mapping

Map DeepSeek finish reasons to Responses status fields:

- `stop` -> completed
- `tool_calls` -> completed
- `length` -> incomplete with `reason: "max_output_tokens"`
- `content_filter` -> incomplete with `reason: "content_filter"`
- `insufficient_system_resource` -> failed with provider error context
- unknown values -> failed with provider error context

The stream finish mapper uses the same rules.

## Usage Mapping

Map DeepSeek usage to Responses usage:

- `prompt_tokens` -> `input_tokens`
- `completion_tokens` -> `output_tokens`
- `total_tokens` -> `total_tokens`
- `prompt_cache_hit_tokens` -> `input_tokens_details.cached_tokens`
- `prompt_cache_miss_tokens` can remain provider raw usage only unless the Responses usage type gets a dedicated miss-token field
- `completion_tokens_details.reasoning_tokens` -> `output_tokens_details.reasoning_tokens`

Streaming chunks with usage-only payloads must not produce bogus text events. They should update usage through `ChatStreamDeltaMapper.extractUsage`.

## Stream Mapping

`DeepSeekStreamDeltaMapper` extracts:

- first choice from `chunk.choices[0]`
- text from `delta.content`
- reasoning text from `delta.reasoning_content`
- tool call deltas from `delta.tool_calls`
- usage from `chunk.usage`
- finish reason from `choice.finish_reason`

The shared `ChatStreamMapper` and `StreamResponseState` own lifecycle events. DeepSeek should use `deferTerminal: true`, matching current provider behavior.

## Error Handling

Provider HTTP errors continue to flow through `ChatProviderClient` and `ProviderError`.

Mapper errors must use the GodeX error hierarchy:

- unsupported request parameters use `AdapterError` with `ADAPTER_REQUEST_UNSUPPORTED_PARAMETER`
- unsupported tools use `AdapterError` with `ADAPTER_REQUEST_UNSUPPORTED_TOOL`
- unsupported input content/items use the shared response-message payload error helpers

Do not throw raw `Error` from DeepSeek adapter/provider code.

## Testing

Add focused unit tests:

- provider factory and client default base URL
- `createDeepSeekMapper()` provider conformance
- compatibility negotiation for hard rejects and diagnostics
- thinking default disabled when reasoning is absent
- reasoning effort mapping to `high` and `max`
- temperature/top-p omission diagnostics in thinking mode
- `tool_choice` mapping in non-thinking mode
- `tool_choice` omission diagnostic in thinking mode
- function tool mapping and safe function downgrades
- unsupported native tools skipped with diagnostics
- reasoning item output from non-stream responses
- reasoning-content history replay for tool-call turns
- empty choices failed response
- finish reason mapping, including `insufficient_system_resource`
- usage mapping for cache hit tokens and reasoning tokens
- stream text, reasoning, tool-call delta, finish, and usage chunks

Update existing conformance tests to include DeepSeek.

Add mocked e2e coverage:

- configure `deepseek` provider
- non-stream text request maps to `/chat/completions`
- stream request emits Responses SSE events
- reasoning request sends `thinking.enabled` and `reasoning_effort`
- default request sends `thinking.disabled`
- function tool call round trip works
- thinking-plus-tool previous response history replays `reasoning_content`

Add live e2e tests gated by environment:

- require `DEEPSEEK_API_KEY`
- require `DEEPSEEK_LIVE_TESTS=1`
- use `deepseek-v4-flash` by default unless `DEEPSEEK_LIVE_MODEL` is set
- skip when either gate is missing
- keep tests small: require one non-stream text smoke test; keep stream behavior in mocked e2e unless a live stream smoke test proves stable and fast

The normal `bun run test` and CI path must pass without a DeepSeek API key.

## Verification

Before implementation is considered complete:

```bash
bun test src/providers/deepseek
bun test src/providers/provider-conformance.test.ts
bun run test
bun run test:e2e
bun run typecheck
bun run lint
```

When live credentials are intentionally available:

```bash
DEEPSEEK_LIVE_TESTS=1 DEEPSEEK_API_KEY=$DEEPSEEK_API_KEY bun test <deepseek-live-test-pattern>
```
