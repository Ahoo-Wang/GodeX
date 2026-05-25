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

The public state-machine actions return the events caused by that state transition:

```ts
const state = StreamResponseState.from(ctx, options);

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

interface StreamResponseStateOptions {
	mapToolCall: (call: ToolCallSnapshot) => ResponseItem;
	nowSeconds?: () => number;
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

type StreamResponseTerminalStatus = Pick<
	ResponseObject,
	"status" | "error" | "incomplete_details"
> & {
	status: "completed" | "incomplete" | "failed";
};

class StreamResponseState {
	static readonly KEY = "stream-response-state";

	readonly phase: StreamResponsePhase;
	readonly snapshot: ResponseObject;

	static from(
		ctx: ResponsesContext,
		options?: StreamResponseStateOptions,
	): StreamResponseState;

	start(): ResponseStreamEvent[];
	onTextDelta(delta: string): ResponseStreamEvent[];
	onTextDone(): ResponseStreamEvent[];
	onReasoningTextDelta(delta: string): ResponseStreamEvent[];
	onReasoningTextDone(): ResponseStreamEvent[];
	onRefusalDelta(delta: string): ResponseStreamEvent[];
	onRefusalDone(): ResponseStreamEvent[];
	onFunctionCallDelta(delta: FunctionCallDelta): ResponseStreamEvent[];
	onFunctionCallDone(index?: number): ResponseStreamEvent[];
	onFinish(status: StreamResponseTerminalStatus): ResponseStreamEvent[];
	onError(error: ResponseError): ResponseStreamEvent[];
}
```

`ctx` is injected once through `from(ctx, options)`. Action methods do not accept `ctx`.

`from(ctx, options)` returns the single state machine for the request. The first call must provide required options. Later calls may omit options and retrieve the existing state.

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
- delegate final output item shape to `options.mapToolCall`

The state machine tracks canonical call snapshots. Provider-specific mapping from a canonical function call into `function_call`, `local_shell_call`, `shell_call`, `apply_patch_call`, `tool_search_call`, `custom_tool_call`, or future item types belongs in `mapToolCall`.

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
- opens a message item and output text content part if needed
- appends `delta` to the text content state
- updates `snapshot.output_text`
- emits `response.output_text.delta`

`onTextDone()` closes the active text block and emits:

1. `response.output_text.done`
2. `response.content_part.done`
3. `response.output_item.done`

Calling `onTextDone()` without an active text block is an invalid transition.

### Refusal Delta

`onRefusalDelta(delta)`:

- ignores empty deltas with no state change and no events
- requires lifecycle `in_progress`
- opens a message item and refusal content part if needed
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
- emits the Responses reasoning text delta event
- updates the reasoning item in `snapshot.output`

`onReasoningTextDone()` closes the active reasoning item and emits the matching reasoning done event.

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

When `index` is omitted, the state machine closes the only active function call. If there is not exactly one active function call, omitting `index` is an invalid transition.

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
- missing required `mapToolCall` option on first creation

Errors should use `AdapterError` from the existing GodeX error hierarchy. State-machine contract violations are adapter-layer failures because they indicate an invalid provider mapper interaction with the streaming adapter.

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

`ResponseSessionPersistenceTransformer` should persist from `StreamResponseState.from(ctx).snapshot` when a terminal event appears or when flush sees a terminal snapshot.

`ResponseLogTransformer` should log from the terminal event response when present, otherwise from `StreamResponseState.snapshot` if terminal.

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
	const state = StreamResponseState.from(ctx, {
		mapToolCall: (call) => mapToolCall(ctx, call),
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

1. Add `StreamResponseState` and sub-state helpers under `src/adapter/mapper`.
2. Replace `StreamState` usage in shared chat stream mapper with `StreamResponseState`.
3. Remove `StreamMapper.buildResponseObject()` from the contract and tests.
4. Update `ResponseSessionPersistenceTransformer` and `ResponseLogTransformer` to read `StreamResponseState.snapshot`.
5. Update OpenAI and Zhipu stream mappers to provide `mapToolCall` options.
6. Delete the old `StreamState` file if no longer referenced.
7. Update docs that describe stream state and stream pipeline.

## Testing Plan

Add focused state-machine tests:

- starts response and emits created/in-progress once
- repeated start throws a GodeX domain error
- rejects output before start
- text delta opens message and content part lazily
- text done closes output text, content part, and message item
- text snapshot updates `output`, `output_text`, `output_index`, and `content_index`
- refusal uses a distinct content part
- refusal done closes refusal, content part, and message item
- reasoning creates a reasoning output item
- reasoning done closes the reasoning item
- function call arguments before name are accumulated and emitted once opened
- function call done emits arguments done and output item done
- multiple function calls preserve output order and stable indexes
- finish closes open outputs before terminal event
- terminal snapshot contains final status and completed timestamp
- repeated finish throws a GodeX domain error
- delta after terminal throws a GodeX domain error

Update integration-level mapper tests:

- shared chat stream mapper emits valid Responses SSE event ordering
- OpenAI stream mapper maps text, refusal, reasoning, tool calls, and finish reasons
- Zhipu stream mapper maps custom tool targets through `mapToolCall`
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
- `StreamMapper` no longer has `buildResponseObject()`.
- Streaming persistence uses `StreamResponseState.snapshot`.
- Output event generation is centralized in the state machine.
- Provider mappers translate provider deltas into state-machine actions.
- Illegal state transitions produce GodeX domain errors.
- The design can support Anthropic content block streaming without reshaping the state-machine boundary.
