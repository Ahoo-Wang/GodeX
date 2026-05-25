# StreamResponseState Design

## Goal

Implement a provider-agnostic `StreamResponseState` state machine for OpenAI Responses SSE output.

The state machine is the single source of truth for streamed response lifecycle, output ordering, event generation, and the current `ResponseObject` snapshot. Provider stream mappers convert upstream protocol events into clean state-machine actions; they do not construct Responses SSE lifecycle events directly.

This design prioritizes a clean architecture and correct OpenAI Responses SSE semantics over compatibility with the current `StreamState` and `ChatCompletionStreamMapper` behavior.

## Non-Goals

- Do not keep a compatibility shim for the old `StreamState` accumulator.
- Do not preserve current event ordering when it conflicts with the Responses SSE model.
- Do not teach the state machine about raw OpenAI Chat Completions, Zhipu, or Anthropic wire events.
- Do not add new provider implementations as part of this change.
- Do not model every possible Responses tool event in the first implementation. The architecture must allow those events later without another state rewrite.

## Current Problems

`StreamState` is currently a mutable accumulator shared through `ResponsesContext.attributes`, while `ChatCompletionStreamMapper` owns most event sequencing and lifecycle logic. This creates several design issues:

- The final response object is rebuilt separately through `StreamMapper.buildResponseObject()`, so event state and response snapshot can diverge.
- Responses SSE lifecycle rules are scattered across provider-oriented mapper code.
- Output indexes, content indexes, and item creation rules are not a first-class part of the state model.
- Future Anthropic support would require mapping `message_start`, `content_block_start`, `content_block_delta`, `content_block_stop`, `message_delta`, and `message_stop` into logic shaped around Chat Completions chunks.

## Design Summary

Add `StreamResponseState` under `src/adapter/mapper/stream-response-state.ts`.

`StreamResponseState` owns:

- response lifecycle phase
- streamed output collection
- message content parts
- tool call output blocks
- terminal status
- current `ResponseObject` snapshot
- generation of `ResponseStreamEvent[]`

Provider stream mappers own:

- parsing upstream stream events
- ignoring provider keepalive or unknown events when appropriate
- translating provider-specific deltas into state-machine actions
- providing provider-specific tool call mapping strategy
- mapping provider finish reasons to Responses status fields

The state machine is created once, then retrieved by downstream code through a separate accessor. Public actions return the events caused by that state transition:

```ts
const state =
	StreamResponseState.get(ctx) ??
	StreamResponseState.create(ctx, options);

const events: ResponseStreamEvent[] = [];
events.push(...state.start());
events.push(...state.onTextDelta(text));
events.push(...state.onTextDone());
events.push(...state.onReasoningTextDelta(reasoningText));
events.push(...state.onReasoningTextDone());
events.push(...state.onRefusalDelta(refusalText));
events.push(...state.onRefusalDone());
events.push(...state.onFunctionCallDelta(toolDelta));
events.push(...state.onFunctionCallDone(toolIndex));
events.push(...state.onFinish(statusFields));

const response = state.snapshot;
```

`snapshot` is a `ResponseObject`, not a wrapper object. It is valid after state creation and is updated after every successful action.

## Public API

```ts
enum StreamResponsePhase {
	IDLE = "idle",
	IN_PROGRESS = "in_progress",
	COMPLETED = "completed",
	INCOMPLETE = "incomplete",
	FAILED = "failed",
}

interface FunctionCallDelta {
	index?: number;
	id?: string;
	name?: string;
	arguments?: string;
}

interface ToolCallSnapshot {
	index: number;
	id: string;
	name: string;
	arguments: string;
}

/**
 * Converts a canonical streamed tool-call snapshot into the final Responses
 * output item shape for the active provider/tool ecosystem.
 *
 * The mapper owns provider-specific item selection such as function_call,
 * local_shell_call, shell_call, apply_patch_call, tool_search_call, or
 * custom_tool_call. It must be deterministic, side-effect free, and must not
 * emit stream events or mutate StreamResponseState.
 */
type ToolCallOutputItemMapper = (call: ToolCallSnapshot) => ResponseItem;

type StreamResponseTerminalStatus = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
> & {
	status: "completed" | "incomplete" | "failed";
};

interface StreamResponseStateOptions {
	toolCallOutputItemMapper: ToolCallOutputItemMapper;
	nowSeconds?: () => number;
}

class StreamResponseState {
	static readonly KEY = "stream-response-state";

	readonly phase: StreamResponsePhase;
	readonly snapshot: ResponseObject;

	static create(
		ctx: ResponsesContext,
		options: StreamResponseStateOptions,
	): StreamResponseState;
	static get(ctx: ResponsesContext): StreamResponseState | undefined;
	static from(ctx: ResponsesContext): StreamResponseState;

	start(): ResponseStreamEvent[];
	onTextDelta(delta: string): ResponseStreamEvent[];
	onTextDone(): ResponseStreamEvent[];
	onReasoningTextDelta(delta: string): ResponseStreamEvent[];
	onReasoningTextDone(): ResponseStreamEvent[];
	onRefusalDelta(delta: string): ResponseStreamEvent[];
	onRefusalDone(): ResponseStreamEvent[];
	onFunctionCallDelta(delta: FunctionCallDelta): ResponseStreamEvent[];
	onFunctionCallDone(index: number): ResponseStreamEvent[];
	onFinish(status: StreamResponseTerminalStatus): ResponseStreamEvent[];
	onError(error: ResponseError): ResponseStreamEvent[];
}
```

`ctx` is injected once through `create(ctx, options)`. Action methods do not accept `ctx`.

`create(ctx, options)` stores the state machine in the request context and throws if one already exists. `from(ctx)` retrieves the existing state and throws a clear adapter error if `create()` has not been called. `get(ctx)` is a non-throwing convenience for provider mappers that lazily create state on the first upstream event.

Only `StreamResponseState.create/get/from` may touch `ResponsesContext.attributes` for this state. This keeps the existing context extension point but hides the `unknown` cast behind typed state-machine accessors. The design does not add a typed `ResponsesContext.streamResponseState` property because that would broaden the request context API for one pipeline concern.

## Sub-State Machines

### ResponseLifecycleState

Owns response-level lifecycle:

```text
idle -> in_progress -> completed
                   -> incomplete
                   -> failed
```

Responsibilities:

- build the initial `queued` snapshot when the state is created
- move the snapshot to `in_progress` when `start()` succeeds
- emit `response.created`
- emit `response.in_progress`
- set terminal `status`, `completed_at`, `error`, and `incomplete_details`
- emit exactly one terminal event: `response.completed`, `response.incomplete`, or `response.failed`
- reject invalid transitions such as delta after terminal

`start()` is explicit and required before output actions. Calling an output action before `start()` is a state error.

The initial snapshot is built internally from `responseId`, `createdAt`, `resolved.model`, and request echo fields from `responseRequestEchoFields(ctx)`, with empty `output` and `status: "queued"`. `start()` transitions the snapshot to `status: "in_progress"` and emits both `response.created` and `response.in_progress` carrying the in-progress snapshot, matching the OpenAI Responses SSE reference behaviour.

### OutputCollectionState

Owns `snapshot.output` ordering and `output_index`.

Responsibilities:

- allocate output indexes in the order output blocks are first opened
- update `snapshot.output` after every state change
- expose output item snapshots to lifecycle terminal events
- support Anthropic-like content block ordering later, where text and tool use may interleave

The state machine must not assume that one response always contains one assistant message followed by tool calls. It may do that for current chat-compatible providers, but the output collection model must support multiple output blocks.

### MessageOutputState

Owns assistant message output blocks and content parts.

Responsibilities:

- create message output item on the first message content delta
- allocate `content_index` per content part
- emit `response.output_item.added` for message items
- emit `response.content_part.added`
- emit `response.output_text.delta` and `response.output_text.done`
- emit `response.refusal.delta` and `response.refusal.done`
- emit reasoning text events through the Responses reasoning model
- emit `response.content_part.done`
- emit `response.output_item.done` for completed message items
- update `snapshot.output_text`

Text and refusal are separate content blocks. Reasoning is represented as a reasoning output item rather than hidden mutable text on the message.

The first implementation will model each text or refusal block as one assistant message item with one content part. This keeps output item open/close behavior explicit and allows Anthropic text, tool, and later text blocks to interleave as separate output items.

### ToolCallOutputState

Owns function and tool call output blocks.

Responsibilities:

- group incoming call deltas by `index`
- allocate a stable call id
- accumulate call name and arguments
- handle arguments arriving before name by accumulating internally, then emitting the initial added event and accumulated argument delta once the call can be opened
- emit `response.output_item.added`
- emit `response.function_call_arguments.delta`
- emit `response.function_call_arguments.done`
- emit `response.output_item.done`
- delegate final output item shape to `options.toolCallOutputItemMapper`

The state machine tracks canonical call snapshots. Provider-specific mapping from a canonical function call into `function_call`, `local_shell_call`, `shell_call`, `apply_patch_call`, `tool_search_call`, `custom_tool_call`, or future item types belongs in `ToolCallOutputItemMapper`.

## Event Payload Contract

The state machine must generate complete OpenAI Responses SSE event payloads. `ResponseSseEncodeTransformer` remains responsible only for wire encoding and sequence-number fallback.

### Response Lifecycle Events

`response.created`:

- `type: "response.created"`
- `response`: in-progress snapshot (same as `response.in_progress`, matching OpenAI reference)

`response.in_progress`:

- `type: "response.in_progress"`
- `response`: current in-progress `snapshot`

Terminal event:

- `type`: `response.completed`, `response.incomplete`, or `response.failed`
- `response`: final `snapshot`

### Message Text Events

When a text block opens, emit `response.output_item.added`:

- `type: "response.output_item.added"`
- `output_index`: allocated output index
- `item`: assistant message item with `id`, `type: "message"`, `role: "assistant"`, `status: "in_progress"`, and empty `content`

Then emit `response.content_part.added`:

- `type: "response.content_part.added"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: allocated content index
- `part`: `{ type: "output_text", text: "" }`

`response.output_text.delta`:

- `type: "response.output_text.delta"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: text content index
- `delta`: text delta

`response.output_text.done`:

- `type: "response.output_text.done"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: text content index
- `text`: accumulated text

`response.content_part.done`:

- `type: "response.content_part.done"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: text content index
- `part`: final `{ type: "output_text", text }`

`response.output_item.done`:

- `type: "response.output_item.done"`
- `output_index`: message output index
- `item`: final assistant message item with `status: "completed"` and final content

### Refusal Events

Refusal uses the same message item lifecycle as text, but the content part is `{ type: "refusal", refusal: "" }`. `response.content_part.added`, `response.content_part.done`, and `response.output_item.done` carry the same fields as text events, replacing the text part with the refusal part.

`response.refusal.delta`:

- `type: "response.refusal.delta"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: refusal content index
- `delta`: refusal delta

`response.refusal.done`:

- `type: "response.refusal.done"`
- `item_id`: message item id
- `output_index`: message output index
- `content_index`: refusal content index
- `refusal`: accumulated refusal text

### Reasoning Events

When a reasoning block opens, emit `response.output_item.added`:

- `type: "response.output_item.added"`
- `output_index`: reasoning output index
- `item`: reasoning item with `id`, `type: "reasoning"`, `summary: []`, `content: []`, and `status: "in_progress"`

Then emit `response.reasoning_text_part.added`:

- `type: "response.reasoning_text_part.added"`
- `item_id`: reasoning item id
- `output_index`: reasoning output index
- `content_index`: reasoning content index
- `part`: `{ type: "reasoning_text", text: "" }`

`response.reasoning_text.delta`:

- `type: "response.reasoning_text.delta"`
- `item_id`: reasoning item id
- `output_index`: reasoning output index
- `content_index`: reasoning content index
- `delta`: reasoning text delta

`response.reasoning_text.done`:

- `type: "response.reasoning_text.done"`
- `item_id`: reasoning item id
- `output_index`: reasoning output index
- `content_index`: reasoning content index
- `text`: accumulated reasoning text

`response.reasoning_text_part.done`:

- `type: "response.reasoning_text_part.done"`
- `item_id`: reasoning item id
- `output_index`: reasoning output index
- `content_index`: reasoning content index
- `part`: final `{ type: "reasoning_text", text }`

`response.output_item.done`:

- `type: "response.output_item.done"`
- `output_index`: reasoning output index
- `item`: final reasoning item with `status: "completed"` and final content

### Function Call Events

When a function call has a name and opens, emit `response.output_item.added`:

- `type: "response.output_item.added"`
- `output_index`: function call output index
- `item_id`: call id
- `item`: mapped output item from `options.toolCallOutputItemMapper` with empty arguments

`response.function_call_arguments.delta`:

- `type: "response.function_call_arguments.delta"`
- `item_id`: call id
- `output_index`: function call output index
- `delta`: argument delta

`response.function_call_arguments.done`:

- `type: "response.function_call_arguments.done"`
- `item_id`: call id
- `output_index`: function call output index
- `text`: accumulated arguments

`response.output_item.done`:

- `type: "response.output_item.done"`
- `output_index`: function call output index
- `item`: final mapped output item

## Event Semantics

### Start

`start()` emits:

1. `response.created`
2. `response.in_progress`

It does not create a message item or content part. Output blocks are opened lazily by the first output action.

Calling `start()` outside `idle` is an invalid transition.

### Text Delta

`onTextDelta(delta)`:

- ignores empty deltas with no state change and no events
- requires lifecycle `in_progress`
- opens a new message item and output text content part when there is no active text block
- appends `delta` to the text content state
- updates `snapshot.output_text`
- emits `response.output_text.delta`

`onTextDone()` closes the active text block and emits:

1. `response.output_text.done`
2. `response.content_part.done`
3. `response.output_item.done`

Calling `onTextDone()` without an active text block is an invalid transition.

After `onTextDone()`, a later `onTextDelta()` opens a new assistant message output item with a new `output_index`. This is the expected representation for Anthropic-style `text -> tool_use -> text` interleaving.

### Refusal Delta

`onRefusalDelta(delta)`:

- ignores empty deltas with no state change and no events
- requires lifecycle `in_progress`
- opens a new message item and refusal content part when there is no active refusal block
- appends `delta` to the refusal content state
- emits `response.refusal.delta`

`onRefusalDone()` closes the active refusal block and emits:

1. `response.refusal.done`
2. `response.content_part.done`
3. `response.output_item.done`

Calling `onRefusalDone()` without an active refusal block is an invalid transition.

### Reasoning Text Delta

`onReasoningTextDelta(delta)`:

- ignores empty deltas with no state change and no events
- requires lifecycle `in_progress`
- opens a reasoning output item if needed
- appends `delta` to reasoning content
- emits `response.reasoning_text.delta`
- updates the reasoning item in `snapshot.output`

`onReasoningTextDone()` closes the active reasoning item and emits `response.reasoning_text.done`, `response.reasoning_text_part.done`, and `response.output_item.done`.

Calling `onReasoningTextDone()` without an active reasoning block is an invalid transition.

### Function Call Delta

`onFunctionCallDelta(delta)`:

- requires lifecycle `in_progress`
- groups by `delta.index` when present, otherwise by next unopened call index
- stores `id`, `name`, and `arguments` when present
- opens the output item only after the call has a name
- emits accumulated argument delta after opening if arguments arrived before name
- updates the mapped item in `snapshot.output`

`onFunctionCallDone(index)` closes the selected function call and emits:

1. `response.function_call_arguments.done`
2. `response.output_item.done`

The `index` argument is required. Chat Completions tool calls provide indexes, and Anthropic content blocks also provide block indexes. Chat-compatible mappers that only receive a final `finish_reason` may skip explicit `onFunctionCallDone()` calls and let `onFinish()` close all still-open function calls in output order.

### Finish

`onFinish(status)`:

- requires lifecycle `in_progress`
- closes every open reasoning item, message content part, message item, and tool call item in output order
- updates `snapshot.status`, `snapshot.completed_at`, `snapshot.error`, and `snapshot.incomplete_details`
- emits the terminal response event based on `snapshot.status`

Repeated finish is an invalid transition. It should throw a domain-specific error instead of silently returning `[]`.

### Error

`onError(error)`:

- requires non-terminal lifecycle
- closes the response as failed
- updates `snapshot.error`
- emits `response.failed`

Provider mappers should use this for upstream stream error events that can be represented as a failed Responses stream.

`onError(error)` is valid from both `idle` and `in_progress`, because an upstream stream can fail before the first model chunk starts the response. It is invalid after any terminal phase.

`onFinish({ status: "failed", error })` represents a model-level terminal status conveyed as the normal end of the provider stream. `onError(error)` represents infrastructure or stream-processing failure before a normal provider stop, such as malformed upstream SSE, upstream stream error events, connection loss surfaced inside the stream, or mapper parse errors that should be translated into a failed Responses stream.

### Usage

Streaming usage accounting is out of scope for the first implementation. `snapshot.usage` remains `undefined` unless a later provider-independent action such as `onUsage(usage)` is added. This avoids hiding provider-specific usage semantics inside `onFinish()`.

## Error Policy

The state machine should fail fast on mapper bugs and illegal transitions:

- output before `start()`
- repeated `start()`
- delta after terminal
- finish before `start()`
- repeated finish
- duplicate content part opening within the same sub-state
- done action without an active matching output block
- function call done without a name
- missing required `toolCallOutputItemMapper` option during `create()`

Errors should use `AdapterError` from the existing GodeX error hierarchy. State-machine contract violations are adapter-layer failures because they indicate an invalid provider mapper interaction with the streaming adapter.

Add stream-specific adapter error codes to `src/error/codes.ts`:

```ts
export const ADAPTER_STREAM_NOT_INITIALIZED =
	"adapter.stream.not_initialized";
export const ADAPTER_STREAM_ALREADY_INITIALIZED =
	"adapter.stream.already_initialized";
export const ADAPTER_STREAM_INVALID_TRANSITION =
	"adapter.stream.invalid_transition";
export const ADAPTER_STREAM_OUTPUT_BEFORE_START =
	"adapter.stream.output_before_start";
export const ADAPTER_STREAM_DELTA_AFTER_TERMINAL =
	"adapter.stream.delta_after_terminal";
export const ADAPTER_STREAM_MISSING_OPTIONS = "adapter.stream.missing_options";
export const ADAPTER_STREAM_MISSING_OUTPUT_BLOCK =
	"adapter.stream.missing_output_block";
export const ADAPTER_STREAM_INCOMPLETE_TOOL_CALL =
	"adapter.stream.incomplete_tool_call";
```

Use the most specific code when one applies, and `ADAPTER_STREAM_INVALID_TRANSITION` for less common invalid transitions.

Provider mappers may ignore provider keepalive, ping, or unknown future event types before they reach `StreamResponseState`.

## Contract Changes

Remove `StreamMapper.buildResponseObject()`.

```ts
export interface StreamMapper<TChunk> {
	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<TChunk>,
	): ResponseStreamEvent[] | Promise<ResponseStreamEvent[]>;
}
```

`ResponseSessionPersistenceTransformer` should prefer the `response` embedded in terminal events. On flush fallback, it should call `StreamResponseState.get(ctx)` and persist `state.snapshot` only if a state exists and its phase is terminal.

`ResponseLogTransformer` should log from the terminal event response when present, otherwise use `StreamResponseState.get(ctx)?.snapshot` if the state phase is terminal.

The adapter stream pipeline remains:

1. provider SSE event
2. provider stream mapper
3. response stream events
4. logging, persistence, compatibility logging
5. SSE wire encoding

## Provider Mapper Shape

Chat-compatible mappers become thin translators:

```ts
map(ctx, event) {
	const state =
		StreamResponseState.get(ctx) ??
		StreamResponseState.create(ctx, {
			toolCallOutputItemMapper: (call) => mapToolCall(ctx, call),
		});
	const choice = extractChoice(event.data);
	if (!choice) return [];

	const events: ResponseStreamEvent[] = [];
	if (state.phase === StreamResponsePhase.IDLE) {
		events.push(...state.start());
	}
	events.push(...state.onTextDelta(extractText(choice.delta)));
	events.push(...state.onReasoningTextDelta(extractReasoningText(choice.delta)));
	events.push(...state.onRefusalDelta(extractRefusalText(choice.delta)));
	for (const toolDelta of extractToolCalls(choice.delta)) {
		events.push(...state.onFunctionCallDelta(toolDelta));
	}
	if (choice.finishReason) {
		events.push(...state.onFinish(mapFinishReason(choice.finishReason)));
	}
	return events;
}
```

Future Anthropic mapper shape:

- `message_start` -> `state.start()`
- `content_block_start` for text -> no-op
- `content_block_delta` text_delta -> `state.onTextDelta(delta.text)`
- `content_block_stop` for text -> `state.onTextDone()`
- `content_block_start` tool_use -> `state.onFunctionCallDelta({ index, id, name })`
- `content_block_delta` input_json_delta -> `state.onFunctionCallDelta({ index, arguments: delta.partial_json })`
- `content_block_stop` for tool_use -> `state.onFunctionCallDone(index)`
- `message_delta` stop_reason -> cache or map finish reason
- `message_stop` -> `state.onFinish(mappedStatus)`
- `ping` and unknown events -> ignore in mapper

## Migration Plan

Implement the migration as one atomic changeset. Do not introduce a long-lived compatibility layer where `StreamState` and `StreamResponseState` both drive stream persistence or event generation.

1. Add error codes for stream state-machine contract violations.
2. Add `StreamResponseState` and sub-state helpers under `src/adapter/mapper`.
3. Replace `StreamState` usage in shared chat stream mapper with `StreamResponseState`.
4. Remove `StreamMapper.buildResponseObject()` from the contract and tests.
5. Update `ResponseSessionPersistenceTransformer` and `ResponseLogTransformer` to read `StreamResponseState.snapshot`.
6. Update OpenAI and Zhipu stream mappers to provide `toolCallOutputItemMapper` options.
7. Delete the old `StreamState` file once no references remain in the same changeset.
8. Update docs that describe stream state and stream pipeline.

Steps 3 through 7 are not independently shippable. The implementation plan should keep commits or checkpoints buildable, but the stream pipeline should not be considered migrated until all of them are complete.

## Testing Plan

Add focused state-machine tests. The list below is the minimum; implementation should target 30 or more state-machine unit tests because the state space crosses lifecycle phase, output type, open/close behavior, and error handling.

- starts response and emits created/in-progress once
- repeated start throws a GodeX domain error
- rejects output before start
- from before create throws `adapter.stream.not_initialized`
- duplicate create throws `adapter.stream.already_initialized`
- text delta opens message and content part lazily
- text done closes output text, content part, and message item
- text after text done opens a new output item
- text snapshot updates `output`, `output_text`, `output_index`, and `content_index`
- refusal uses a distinct content part
- refusal done closes refusal, content part, and message item
- reasoning creates a reasoning output item
- reasoning done closes the reasoning item
- finish closes an open reasoning item before terminal response
- function call arguments before name are accumulated and emitted once opened
- accumulated function call arguments replay after call opens
- function call done emits arguments done and output item done
- multiple function calls preserve output order and stable indexes
- function call done requires an explicit index
- finish closes open outputs before terminal event
- terminal snapshot contains final status and completed timestamp
- repeated finish throws a GodeX domain error
- delta after terminal throws a GodeX domain error

Update integration-level mapper tests:

- shared chat stream mapper emits valid Responses SSE event ordering
- OpenAI stream mapper maps text, refusal, reasoning, tool calls, and finish reasons
- Zhipu stream mapper maps custom tool targets through `ToolCallOutputItemMapper`
- persistence transformer persists `StreamResponseState.snapshot`
- log transformer can log terminal stream completion from snapshot fallback

Verification commands:

```bash
bun test src/adapter/mapper
bun test src/providers/shared/chat-stream-mapper.test.ts
bun test src/providers/openai/stream.test.ts src/providers/zhipu/stream.test.ts
bun test src/adapter/transformers
bun run check
```

## Acceptance Criteria

- `StreamResponseState` is the only stream response state source.
- `StreamResponseState` has separate `create()`, `get()`, and `from()` accessors.
- Initial queued/in-progress snapshots are built internally from `ResponsesContext` fields and `responseRequestEchoFields()`.
- `StreamMapper` no longer has `buildResponseObject()`.
- Streaming persistence uses `StreamResponseState.snapshot`.
- Output event generation is centralized in the state machine.
- Generated Responses SSE events include `response` (lifecycle events only), `item`, `item_id`, `output_index`, and `content_index` fields according to the event payload contract.
- Provider mappers translate provider deltas into state-machine actions.
- Illegal state transitions produce GodeX domain errors.
- Stream-specific adapter error codes are added to `src/error/codes.ts`.
- The design can support Anthropic content block streaming without reshaping the state-machine boundary.
