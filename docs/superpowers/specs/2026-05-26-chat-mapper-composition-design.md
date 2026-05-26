# Chat Mapper Composition Design

## Goal

Refactor Chat Completions-compatible mapper code into high-cohesion, low-coupling mapper components.

The public adapter contracts remain stable:

```ts
RequestMapper<TReq>
ResponseMapper<TRes>
StreamMapper<TChunk>
ProviderMapper<TReq, TRes, TChunk>
```

Inside those contracts, request, response, and stream mapping should be assembled from focused sub-responsibility interfaces. OpenAI and Zhipu should provide provider-specific implementations of those sub-responsibilities and compose them into complete mappers.

This is a thorough mapper refactor. The implementation should not preserve old request/response/tool files as long-term compatibility facades. Compatibility is protected by tests, not by carrying unclear module boundaries forward.

## Current Evidence

- `src/adapter/mapper/contract.ts` defines the stable top-level mapper interfaces.
- `src/adapter/provider.ts` defines `ProviderMapper` as the adapter-visible bundle of request, response, and stream mappers.
- `src/providers/shared/chat-stream-mapper.ts` already proves that stream mapping can use a shared chat lifecycle with provider-specific hooks.
- `src/adapter/mapper/stream-response-state.ts` is provider-agnostic and owns Responses SSE lifecycle state.
- `src/providers/openai/request.ts` and `src/providers/zhipu/request.ts` duplicate request assembly responsibilities while mixing provider policy, message mapping, tool mapping, response format handling, and compatibility behavior.
- `src/providers/openai/response.ts` and `src/providers/zhipu/response.ts` duplicate response object assembly, output text extraction, usage mapping, finish reason handling, and tool call restoration.
- `src/adapter/compatibility.ts` already provides structured diagnostics, but compatibility decisions are currently scattered in provider-specific request code.

## Design Principles

1. Keep adapter-facing contracts stable.
   `DefaultAdapter`, route handlers, and provider clients should keep consuming `ProviderMapper<TReq, TRes, TChunk>`.

2. Make mapper internals compositional.
   A complete mapper should be built from smaller mappers with one clear reason to change.

3. Keep provider policy near the provider.
   OpenAI and Zhipu differences belong under their provider mapper modules, not in generic adapter code.

4. Centralize compatibility negotiation.
   Unsupported, ignored, and degraded features should be decided once per request and exposed through a `CompatibilityPlan`.

5. Prefer behavior tests over compatibility shims.
   Existing OpenAI and Zhipu behavior should be preserved through tests that compare request, response, stream, diagnostics, and error behavior.

## Target File Layout

```text
src/adapter/mapper/
├── contract.ts
└── chat/
    ├── contract.ts
    ├── compatibility-plan.ts
    ├── request-mapper.ts
    ├── response-mapper.ts
    ├── stream-mapper.ts
    ├── response-object-builder.ts
    ├── stream-response-message.ts
    ├── stream-response-output.ts
    ├── stream-response-state.ts
    └── stream-response-tool-call.ts

src/providers/openai/mapper/
├── index.ts
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

src/providers/zhipu/mapper/
├── index.ts
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

`src/adapter/mapper/chat` contains reusable chat mapper composition. It must not import OpenAI or Zhipu provider modules.

`src/adapter/mapper/chat/compatibility-plan.ts` contains only provider-agnostic capability, decision, and plan types. It does not implement negotiation. Concrete compatibility negotiators live in `src/providers/*/mapper/compatibility.ts` because negotiation policy is provider-specific.

`src/providers/*/mapper` contains provider-specific protocol field names, capability rules, tool name policies, finish reason mapping, and upstream response extraction.

Old modules such as `src/providers/openai/request.ts`, `src/providers/zhipu/response.ts`, and `src/providers/zhipu/tools.ts` should be removed or replaced by the new focused modules as part of the refactor. They should not remain as parallel APIs after the migration is complete.

## Sub-Responsibility Interfaces

The first implementation should keep the interface set small and tied to current duplication.

```ts
export interface CompatibilityNegotiator {
	negotiate(ctx: ResponsesContext): CompatibilityPlan;
}

export interface ChatMessageMapper<TMessage> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TMessage[];
}

export interface ChatToolMapper<TTools> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TTools | undefined;
}

export interface ChatToolChoiceMapper<TToolChoice> {
	map(ctx: ResponsesContext, plan: CompatibilityPlan): TToolChoice | undefined;
}

export interface ChatCompletionRequestShape<TMessage, TTools, TToolChoice> {
	model: unknown;
	messages: TMessage[];
	tools?: TTools;
	tool_choice?: TToolChoice;
}

export interface ChatChoiceExtractor<TSource, TChoice> {
	firstChoice(source: TSource): TChoice | undefined;
}

export interface ChatRequestFactory<TReq> {
	create(ctx: ResponsesContext, plan: CompatibilityPlan): TReq;
}

export interface ChatRequestOptionsMapper<TReq> {
	apply(ctx: ResponsesContext, plan: CompatibilityPlan, request: TReq): void;
}

export interface ChatResponseAccessor<TRes, TChoice, TFinishReason>
	extends ChatChoiceExtractor<TRes, TChoice>
{
	finishReason(choice: TChoice | undefined): TFinishReason | string | null | undefined;
}

export interface ChatResponseOutputMapper<TRes> {
	map(ctx: ResponsesContext, result: TRes): ResponseObject["output"];
}

export interface ChatUsageMapper<TSource> {
	map(source: TSource): ResponseUsage | undefined;
}

export interface ChatFinishReasonMapper<TFinishReason> {
	map(finishReason: TFinishReason | string | null | undefined): ResponseStatusFields;
}

export interface ChatStreamDeltaMapper<TChunk, TDelta, TFinishReason> {
	extractChoice(chunk: TChunk): ChatStreamChoice<TDelta, TFinishReason> | null;
	extractText(delta: TDelta): string;
	extractReasoningText(delta: TDelta): string;
	extractRefusalText(delta: TDelta): string;
	extractToolCalls(delta: TDelta): ChatStreamToolCallDelta[];
	extractUsage(chunk: TChunk): ResponseUsage | undefined;
}

export interface ChatToolCallIdentity {
	upstreamName: string;
	name: string;
	namespace?: string;
}

export interface ChatToolCallIdentityResolver {
	resolve(ctx: ResponsesContext, upstreamName: string): ChatToolCallIdentity;
}

export interface ChatToolCallMapper {
	map(
		ctx: ResponsesContext,
		call: ToolCallSnapshot,
		identity: ChatToolCallIdentity,
	): ResponseItem;
}
```

Provider implementations may use classes or plain objects. The important boundary is the interface, not inheritance.

`ChatResponseAccessor` and `ChatStreamDeltaMapper` share the same provider-specific concept of choice extraction, but they operate on different source shapes. `ChatResponseAccessor` extracts a final choice from a complete non-stream response. `ChatStreamDeltaMapper` extracts one incremental choice from an SSE chunk, where keepalive chunks, usage-only chunks, and partial deltas are valid. They remain separate interfaces while sharing the `ChatChoiceExtractor` vocabulary for non-stream sources.

`ChatToolCallIdentityResolver` maps upstream function/tool names back to Responses identity, including namespace restoration when request tools make that possible. `ChatToolCallMapper` receives both the raw upstream snapshot and resolved identity, so it does not need to rediscover namespace or built-in tool identity on its own.

## Complete Mapper Composition

### Request

`ChatRequestMapper<TReq, TMessage, TTools, TToolChoice>` implements `RequestMapper<TReq>`, where `TReq` extends the minimal Chat Completions request shape: `model`, `messages`, optional `tools`, and optional `tool_choice`.

Responsibilities:

- call `CompatibilityNegotiator.negotiate(ctx)` once
- create the provider request skeleton through `ChatRequestFactory`
- assign mapped messages to `request.messages`
- assign mapped tools to `request.tools`
- assign mapped tool choice to `request.tool_choice` only when valid for the effective plan
- apply provider request options such as stream flags, temperature, top-p, token limit, user identity, reasoning, response format, metadata, store, service tier, and provider-specific fields

`ChatRequestMapper` intentionally knows only the standard Chat Completions request fields `messages`, `tools`, and `tool_choice`. Provider-specific fields such as `stream_options`, `web_search_options`, `thinking`, `response_format`, and token limits stay in `ChatRequestOptionsMapper`.

The request skeleton is the minimum valid provider request object before optional mapping. It should include required provider fields such as the upstream model field and any required empty containers such as `messages` when the provider type requires them. Optional parameters such as sampling, streaming, tool choice, response format, metadata, and reasoning belong in `ChatRequestOptionsMapper`, not in the factory.

### Response

`ChatResponseMapper<TRes, TFinishReason>` implements `ResponseMapper<TRes>`.

Responsibilities:

- extract the first provider choice through `ChatResponseAccessor`
- map the provider finish reason into Responses status fields
- map output items through `ChatResponseOutputMapper`
- map usage through `ChatUsageMapper`
- build the common `ResponseObject` envelope through a shared response object builder
- return a failed `ResponseObject` for empty upstream choices when that is current provider behavior

The shared response mapper owns the Responses envelope. Provider modules own output item details and upstream field extraction.

### Stream

`ChatStreamMapper<TChunk, TDelta, TFinishReason>` implements `StreamMapper<TChunk>`.

Responsibilities:

- lazily create or retrieve `StreamResponseState`
- use `ChatStreamDeltaMapper` to parse upstream chunks
- start the Responses lifecycle on the first choice-bearing chunk
- feed text, reasoning, refusal, tool call, usage, and finish reason events into `StreamResponseState`
- map streamed tool call snapshots through `ChatToolCallMapper`
- map finish reasons through `ChatFinishReasonMapper`

`StreamResponseState` remains the source of truth for event ordering, output indexes, terminal events, and response snapshots.

## Compatibility Negotiation

The refactor should add a static, request-local compatibility negotiation step. It does not call upstream APIs or probe remote model metadata at request time.

```ts
export interface ProviderCapabilities {
	parameters: ParameterCapabilities;
	tools: ToolCapabilities;
	toolChoice: ToolChoiceCapabilities;
	responseFormats: ResponseFormatCapabilities;
	reasoning: ReasoningCapabilities;
	streaming: StreamingCapabilities;
}

export interface CompatibilityPlan {
	capabilities: ProviderCapabilities;
	diagnostics: CompatibilityDiagnostic[];
	parameters: Record<string, CompatibilityDecision>;
	// Keyed by canonical Responses tool type, such as "function", "web_search", or "mcp"; not by tool name.
	tools: Map<string, CompatibilityDecision>;
	toolChoice?: CompatibilityDecision;
	responseFormat?: CompatibilityDecision;
	reasoning?: CompatibilityDecision;
}

export interface CompatibilityDecision {
	action: "supported" | "degraded" | "ignored" | "rejected";
	reason?: string;
	effectiveValue?: unknown;
}
```

The negotiator should:

- reject unsupported hard failures by throwing `AdapterError` with the existing domain code
- add diagnostics for degraded and ignored features to `ResponsesContext`
- expose effective values to downstream mappers
- keep policy differences provider-specific

`CompatibilityPlan.diagnostics` is a snapshot of diagnostics created by the negotiator. The logging source of truth remains `ResponsesContext.diagnostics`, so request handling still emits one diagnostics log entry through the existing compatibility logging path.

Examples:

```text
background=true      -> rejected
conversation         -> rejected
prompt               -> rejected
truncation=auto      -> ignored with warning
parallel_tool_calls  -> ignored or degraded with warning
tool_choice=specific -> degraded to auto for Zhipu
unsupported tools    -> rejected or skipped according to provider policy
json_schema          -> kept, degraded to json_object, or rejected by provider policy
reasoning.effort     -> kept as effort or degraded to provider boolean thinking
```

Existing `CompatibilityDiagnostic` remains the logging format. The new compatibility plan is the decision source used by mapper components.

## Provider Responsibilities

### OpenAI

OpenAI mapper modules should preserve current OpenAI behavior:

- developer instructions remain `developer` messages
- multimodal user content can map to Chat Completions content parts
- OpenAI-native `custom`, `web_search_options`, namespace flattening, and tool choice variants remain supported where the protocol type supports them
- `prompt_cache_key`, `prompt_cache_retention`, `safety_identifier`, `text.verbosity`, `metadata`, `store`, `service_tier`, and `parallel_tool_calls` continue to map as they do today
- OpenAI finish reasons keep the existing status mapping

### Zhipu

Zhipu mapper modules should preserve current Zhipu behavior:

- developer instructions downgrade to `system`
- text-only message mapping remains explicit
- tool names use `toZhipuFunctionName`
- unsupported tool types can be skipped with diagnostics where current behavior does so
- mapped tool capacity is enforced
- `tool_choice` values unsupported by Zhipu degrade to `auto` when tools are present
- `reasoning.effort` maps to `thinking: { type: "enabled" }`
- JSON schema/object formats map to Zhipu JSON object mode
- Zhipu finish reasons keep the existing status mapping
- downgraded Codex tool calls are restored to Responses output items when possible

## Error Handling

The refactor must keep the GodeX error hierarchy:

```text
unsupported request parameter -> AdapterError(ADAPTER_REQUEST_UNSUPPORTED_PARAMETER)
unsupported tool              -> AdapterError(ADAPTER_REQUEST_UNSUPPORTED_TOOL)
invalid stream transition     -> existing stream AdapterError code
empty upstream choices        -> failed ResponseObject when current behavior expects it
```

Provider mapper code should not throw raw `Error` for adapter/provider domain failures.

## Testing Strategy

The test suite should be reorganized around the new responsibilities and should preserve existing behavior.

1. Sub-responsibility unit tests
   - message mappers
   - tool mappers
   - tool choice mappers
   - request option mappers
   - response output mappers
   - usage mappers
   - finish reason mappers
   - stream delta mappers
   - compatibility negotiators

2. Shared composition tests
   - `ChatRequestMapper` calls negotiation once and composes request parts in order
   - `ChatResponseMapper` builds the common Responses envelope and output text
   - `ChatStreamMapper` preserves lifecycle events through `StreamResponseState`
   - compatibility plan decisions drive mapper behavior instead of duplicated checks

3. Provider compatibility tests
   - migrate existing OpenAI request/response/stream tests to the new modules
   - migrate existing Zhipu request/response/stream tests to the new modules
   - keep downgrade/reject diagnostics expectations
   - keep Codex tool restoration tests
   - keep stream event ordering expectations

4. Integration tests
   - existing `/v1/responses` route tests should still pass
   - e2e tests with mocked upstream should still pass

## Migration Plan

1. Add `src/adapter/mapper/chat` contracts, compatibility plan types, and shared composition mappers.
2. Move `StreamResponseState` and related stream output helpers under `src/adapter/mapper/chat`.
3. Implement provider capability and compatibility modules for OpenAI and Zhipu.
4. Implement OpenAI mapper submodules and `createOpenAIMapper()`.
5. Implement Zhipu mapper submodules and `createZhipuMapper()`.
6. Update `OpenAIProvider` and `ZhipuProvider` to consume the composed mapper objects.
7. Move or rewrite tests to target the new module boundaries.
8. Remove superseded mapper modules once all imports have moved.
9. Run `bun run typecheck`, `bun run lint`, `bun run test`, and `bun run test:e2e`.

## Non-Goals

- Do not add a new provider implementation.
- Do not change the config schema.
- Do not change the public `Provider`, `ProviderMapper`, `RequestMapper`, `ResponseMapper`, or `StreamMapper` contracts.
- Do not modify stream pipeline transformers except import paths required by moving chat stream state files.
- Do not implement runtime upstream capability discovery.
- Do not keep old mapper modules as long-term facades after the migration is complete.

## Success Criteria

- OpenAI and Zhipu providers are assembled from focused sub-responsibility mappers.
- Compatibility decisions are centralized in provider-specific negotiators and exposed through `CompatibilityPlan`.
- Existing OpenAI and Zhipu request, response, stream, diagnostic, and tool restoration behavior remains compatible.
- Mapper tests are organized around clear responsibilities instead of large mixed-purpose request/response functions.
- `bun run typecheck` passes.
- `bun run lint` passes.
- `bun run test` passes.
- `bun run test:e2e` passes before claiming end-to-end compatibility is preserved.
