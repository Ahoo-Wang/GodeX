# Responses Bridge Kernel

GodeX is a bridge for upstreams that expose Chat Completions, not for upstreams that already expose the Responses API. Responses-native upstreams should be called directly by the client.

## Component Interaction

```mermaid
flowchart TB
  Client["Client\nOpenAI Responses API"] --> Server["/v1/responses route"]
  Server --> Context["ResponsesContext\nrequest id, resolved model, session, diagnostics"]
  Context --> Resolver["ModelResolver"]
  Context --> Session["ResponseSessionStore\nprevious_response_id chains"]
  Context --> Registrar["Registrar\nprovider factory resolution"]
  Registrar --> Provider["ProviderEdge\nProviderSpec + request/stream"]

  Provider --> Adapter["DefaultAdapter"]
  Adapter --> RequestPipeline["SyncRequestPipeline"]
  Adapter --> StreamPipeline["StreamPipeline"]

  RequestPipeline --> Exchange["ProviderExchange\nbuild + trace + call"]
  StreamPipeline --> Exchange

  Exchange --> RequestBuilder["bridge/request\nbuildChatCompletionRequest"]
  RequestBuilder --> Compatibility["bridge/compatibility\nCompatibilityPlan"]
  RequestBuilder --> ToolPlan["bridge/tools\nToolPlan + identities"]
  RequestBuilder --> OutputContract["bridge/output\nOutputContractPlan"]
  RequestBuilder --> ClientHttp["ChatProviderClient"]
  ClientHttp --> Upstream["Chat Completions upstream\nZhipu, DeepSeek, custom"]

  Upstream --> ResponseRecon["bridge/response\nreconstructResponseObject"]
  Upstream --> StreamDeltas["ProviderSpec.stream.deltas"]

  ResponseRecon --> OutputValidation["bridge/output validator"]
  StreamDeltas --> StreamState["bridge/stream\nResponseStreamStateMachine"]
  StreamState --> StreamValidation["ResponseOutputContractValidationTransformer"]

  OutputValidation --> Response["ResponseObject JSON"]
  StreamValidation --> SSE["Responses SSE events"]

  Context --> Observability["logger + trace recorder\nrequest, event, usage, diagnostics"]
```

## Tool Planning

Tool support is intentionally planned before provider rendering.

```mermaid
sequenceDiagram
  participant Req as Responses request
  participant Caps as ProviderCapabilities
  participant Planner as planTools
  participant Renderer as renderProviderToolDeclarations
  participant Upstream as Chat Completions upstream
  participant Restorer as Tool call restorer

  Req->>Planner: tools + tool_choice
  Caps->>Planner: native, degraded, supported tool_choice
  Planner-->>Renderer: supported/degraded entries
  Planner-->>Req: diagnostics for ignored/degraded/rejected decisions
  Renderer->>Upstream: provider-compatible tool declarations
  Upstream-->>Restorer: provider tool calls
  Restorer-->>Req: Responses tool call items with original identities
```

Rules:

- `tool_choice: "none"` disables declarations.
- Explicit `tool_choice` for a tool that cannot be declared is rejected.
- Built-in Codex tools, custom tools, and namespace tools may downgrade to function tools when the provider supports that loss.
- OpenAI-native discovery controls such as `tool_search` are not executable functions; providers without native support ignore them and keep any eagerly declared tools.
- Provider hooks expose protocol differences; shared support/degrade/reject policy stays in `bridge/tools`.

## Output Format Contract

`json_schema` is degraded to `json_object` only when the provider declares that mapping. When the original schema request has `strict: true`, GodeX validates that the final model output is valid JSON.

```mermaid
flowchart LR
  Request["text.format json_schema strict=true"] --> Plan["CompatibilityPlan\njson_schema -> json_object"]
  Plan --> Contract["OutputContractPlan\nrequiresValidJson=true"]
  Contract --> Sync["Sync response validation"]
  Contract --> Stream["Stream terminal validation"]
  Sync -->|invalid JSON| SyncError["AdapterError\nadapter.response.invalid_output_format"]
  Stream -->|invalid JSON| FailedEvent["response.failed SSE event"]
```

The validator checks JSON syntax, not full JSON Schema conformance. The schema is still provided to the model as an instruction when degraded.

## Provider Onboarding Shape

A new provider should add only provider-specific rendering and transport:

- `spec.ts`, `client.ts`, `hooks.ts`, `index.ts`
- `protocol/` types if the upstream is not OpenAI Chat Completions compatible
- `ProviderSpec.capabilities` for supported/degraded parameters, tools, tool_choice, response formats, reasoning, and streaming usage
- response accessors for first choice, finish reason, output text, and usage
- stream delta extractor that emits bridge `ProviderStreamDelta` values
- optional request/response/chunk hooks for real provider quirks

Shared policy belongs in `src/bridge/`. Shared protocol plumbing belongs in `src/providers/shared/`. Provider folders should not duplicate compatibility policy between providers.

## Verification Surface

- Unit tests protect bridge single-responsibility modules: compatibility planning, tool planning, and output validation.
- Provider conformance tests prove every built-in provider exposes a valid `ProviderSpec` and `ProviderEdge`.
- Mocked E2E tests prove the real route, context, resolver, session, adapter, provider client, stream pipeline, diagnostics, and mock upstream work together.
- Live provider tests remain opt-in through environment gates.
