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
  Registrar --> Provider["Bridge Provider\nmapper + client"]

  Provider --> Adapter["DefaultAdapter"]
  Adapter --> RequestPipeline["SyncRequestPipeline"]
  Adapter --> StreamPipeline["StreamPipeline"]

  RequestPipeline --> RequestMapper["ChatRequestMapper"]
  StreamPipeline --> RequestMapper

  RequestMapper --> Compatibility["bridge/compatibility\nCompatibilityPlan"]
  RequestMapper --> ToolPlan["bridge/tools\nBridgeToolPlan"]
  RequestMapper --> OutputContract["bridge/output\nOutputFormatContract"]
  RequestMapper --> ProviderRender["Provider mapper modules\nmessages, tools, options"]
  ProviderRender --> ClientHttp["ChatProviderClient"]
  ClientHttp --> Upstream["Chat Completions upstream\nZhipu, DeepSeek, custom"]

  Upstream --> ResponseMapper["ChatResponseMapper"]
  Upstream --> StreamMapper["ChatStreamMapper"]

  ResponseMapper --> OutputValidation["bridge/output validator"]
  StreamMapper --> StreamState["StreamResponseState"]
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
  participant Planner as planBridgeTools
  participant Mapper as Provider tools mapper
  participant Upstream as Chat Completions upstream
  participant Restorer as Tool call restorer

  Req->>Planner: tools + tool_choice
  Caps->>Planner: native, degraded, supported tool_choice
  Planner-->>Mapper: supported/degraded entries
  Planner-->>Req: diagnostics for ignored/degraded/rejected decisions
  Mapper->>Upstream: provider-specific tool declarations
  Upstream-->>Restorer: provider tool calls
  Restorer-->>Req: Responses tool call items with original identities
```

Rules:

- `tool_choice: "none"` disables declarations.
- Explicit `tool_choice` for a tool that cannot be declared is rejected.
- Built-in Codex tools, custom tools, `tool_search`, and namespace tools may downgrade to function tools when the provider supports that loss.
- Provider modules render already-planned decisions; they should not silently re-decide compatibility.

## Output Format Contract

`json_schema` is degraded to `json_object` only when the provider declares that mapping. When the original schema request has `strict: true`, GodeX validates that the final model output is valid JSON.

```mermaid
flowchart LR
  Request["text.format json_schema strict=true"] --> Plan["CompatibilityPlan\njson_schema -> json_object"]
  Plan --> Contract["OutputFormatContract\nrequiresValidJson=true"]
  Contract --> Sync["Sync response validation"]
  Contract --> Stream["Stream terminal validation"]
  Sync -->|invalid JSON| SyncError["AdapterError\nadapter.response.invalid_output_format"]
  Stream -->|invalid JSON| FailedEvent["response.failed SSE event"]
```

The validator checks JSON syntax, not full JSON Schema conformance. The schema is still provided to the model as an instruction when degraded.

## Provider Onboarding Shape

A new provider should add only provider-specific rendering and transport:

- `provider.ts`, `provider-client.ts`, `factory.ts`, `index.ts`
- `protocol/` types if the upstream is not OpenAI Chat Completions compatible
- `mapper/capabilities.ts`
- `mapper/compatibility.ts` using `planBridgeCompatibility`
- `mapper/tools.ts` using `planBridgeTools`
- `mapper/messages.ts`, `request-options.ts`, `response-output.ts`, `usage.ts`, `finish-reason.ts`, `stream-delta.ts`, `tool-calls.ts`

Shared policy belongs in `src/bridge/`. Shared protocol plumbing belongs in `src/providers/shared/`. Provider folders should not duplicate compatibility policy between providers.

## Verification Surface

- Unit tests protect bridge single-responsibility modules: compatibility planning, tool planning, and output validation.
- Provider conformance tests prove every built-in provider mapper still satisfies the structural contract.
- Mocked E2E tests prove the real route, context, resolver, session, adapter, provider client, stream pipeline, diagnostics, and mock upstream work together.
- Live provider tests remain opt-in through environment gates.
