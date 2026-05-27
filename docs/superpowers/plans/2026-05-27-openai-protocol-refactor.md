# OpenAI Protocol Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the large OpenAI Responses protocol type file into a focused `src/protocol/openai/responses/` subdomain without changing runtime behavior or protocol shapes.

**Architecture:** `src/protocol/openai/responses/index.ts` becomes the canonical Responses API-family entry point. Leaf modules own content, messages, tools, tool-call items, reasoning, request payloads, response objects, and stream events. Application code continues importing from `src/protocol/openai` or `src/protocol/openai/responses`; only modules inside the Responses protocol subdomain import leaf files directly.

**Tech Stack:** TypeScript strict mode, Bun test runner, Biome, existing `src/module-boundaries.test.ts` barrel rules.

---

## File Structure

Create these files:

- `src/protocol/openai/responses/content.ts` - input/output content parts, annotations, token logprobs.
- `src/protocol/openai/responses/environments.ts` - container and local execution environment shapes shared by tools and tool-call items.
- `src/protocol/openai/responses/messages.ts` - input message items and assistant output message items.
- `src/protocol/openai/responses/tool-items.ts` - response-history tool calls and tool outputs.
- `src/protocol/openai/responses/reasoning.ts` - reasoning and compaction response items.
- `src/protocol/openai/responses/tools.ts` - request-time tool definitions and tool choices.
- `src/protocol/openai/responses/items.ts` - `ResponseItem` union assembly.
- `src/protocol/openai/responses/request.ts` - `ResponseIncludable` and `ResponseCreateRequest`.
- `src/protocol/openai/responses/object.ts` - `ResponseObject`, status, usage, and incomplete detail types.
- `src/protocol/openai/responses/stream.ts` - `ResponseStreamEventType` and `ResponseStreamEvent`.
- `src/protocol/openai/responses/index.ts` - pure local barrel for the Responses API family.

Delete this file:

- `src/protocol/openai/responses.ts`

Keep this file as a pure API-family barrel:

- `src/protocol/openai/index.ts`

## Task 1: Create Content, Message, Reasoning, And Environment Leaves

**Files:**
- Create: `src/protocol/openai/responses/content.ts`
- Create: `src/protocol/openai/responses/environments.ts`
- Create: `src/protocol/openai/responses/messages.ts`
- Create: `src/protocol/openai/responses/reasoning.ts`
- Read: `src/protocol/openai/responses.ts`
- Test: `bun run typecheck`

- [ ] **Step 1: Create the Responses directory**

Run:

```bash
mkdir -p src/protocol/openai/responses
```

Expected: the directory exists and `git status --short` shows no tracked changes yet.

- [ ] **Step 2: Create `content.ts`**

Create `src/protocol/openai/responses/content.ts` with this dependency header:

```ts
import type {
	ImageDetail,
	TokenLogprobItem,
} from "../shared";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `ResponseInputText`
- `ResponseInputImage`
- `ResponseInputFile`
- `ResponseInputContent`
- `ResponseInputMessageContentList`
- `ResponseOutputText`
- `ResponseOutputRefusal`
- `ResponseOutputContent`
- `ResponseTokenLogprob`
- `FileCitation`
- `URLCitation`
- `ContainerFileCitation`
- `FilePath`
- `ResponseAnnotation`

Keep every field name, optional marker, literal value, and union member exactly as it is in the source file.

- [ ] **Step 3: Create `environments.ts`**

Create `src/protocol/openai/responses/environments.ts` with this dependency header:

```ts
import type {
	ContainerMemoryLimit,
	ContainerNetworkPolicy,
	InlineSkill,
	LocalSkill,
	SkillReference,
} from "../shared";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `ContainerAuto`
- `LocalEnvironment`
- `ContainerReference`
- `ShellCallEnvironment`

This module must not import from `tools.ts` or `tool-items.ts`.

- [ ] **Step 4: Create `messages.ts`**

Create `src/protocol/openai/responses/messages.ts` with this dependency header:

```ts
import type {
	Phase,
	Role,
	ItemStatus,
} from "../shared";
import type {
	ResponseInputMessageContentList,
	ResponseOutputContent,
} from "./content";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `EasyInputMessage`
- `ResponseInputMessage`
- `InputItemBase`
- `InputItem`
- `ResponseOutputMessage`

- [ ] **Step 5: Create `reasoning.ts`**

Create `src/protocol/openai/responses/reasoning.ts` with this dependency header:

```ts
import type { ItemStatus } from "../shared";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `SummaryTextContent`
- `ReasoningTextContent`
- `Reasoning`
- `Compaction`

- [ ] **Step 6: Run a focused typecheck**

Run:

```bash
bun run typecheck
```

Expected: this may fail while `responses.ts` still owns the original definitions and the new leaf files are not exported. Accept duplicate-export or unused-file-adjacent errors at this point only if they point to the partially completed split. Do not proceed if the error indicates a typo in a moved field or import path.

## Task 2: Create Tool Definition And Tool Item Modules

**Files:**
- Create: `src/protocol/openai/responses/tools.ts`
- Create: `src/protocol/openai/responses/tool-items.ts`
- Read: `src/protocol/openai/responses.ts`
- Test: `bun run typecheck`

- [ ] **Step 1: Create `tools.ts`**

Create `src/protocol/openai/responses/tools.ts` with this dependency header:

```ts
import type { ImageGenerationModel } from "../models";
import type {
	ApproximateLocation,
	CustomToolInputFormat,
	FileSearchFilter,
	FileSearchRankingOptions,
	ImageBackground,
	ImageGenerationAction,
	ImageInputFidelity,
	ImageModeration,
	ImageOutputFormat,
	ImageQuality,
	ImageStandardSize,
	McpAllowedTools,
	McpConnectorId,
	McpRequireApproval,
	SearchContextSize,
	ToolChoiceMode,
} from "../shared";
import type {
	ContainerAuto,
	ContainerReference,
	LocalEnvironment,
} from "./environments";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `FunctionTool`
- `FileSearchTool`
- `ComputerTool`
- `ComputerUsePreviewTool`
- `WebSearchTool`
- `WebSearchPreviewTool`
- `McpTool`
- `CodeInterpreterToolAuto`
- `CodeInterpreterTool`
- `ImageGenerationInputMask`
- `ImageGenerationTool`
- `LocalShellTool`
- `ShellTool`
- `CustomTool`
- `NamespaceFunctionTool`
- `NamespaceCustomTool`
- `NamespaceTool`
- `ToolSearchConfig`
- `ApplyPatchTool`
- `ResponseTool`
- `ToolChoiceAllowed`
- `ToolChoiceTypes`
- `ToolChoiceFunction`
- `ToolChoiceMcp`
- `ToolChoiceCustom`
- `ToolChoiceApplyPatch`
- `ToolChoiceShell`
- `ResponseToolChoice`
- `ToolDefinition`

Move `ToolDefinition` from its current source location into this module next to the request-time tool definitions. Preserve the same union members and order.

- [ ] **Step 2: Create `tool-items.ts`**

Create `src/protocol/openai/responses/tool-items.ts` with this dependency header:

```ts
import type { ItemStatus } from "../shared";
import type { ResponseInputContent } from "./content";
import type {
	ContainerReference,
	LocalEnvironment,
} from "./environments";
import type { ToolDefinition } from "./tools";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `FileSearchCall`
- `FileSearchCallResult`
- `ComputerActionClick`
- `ComputerActionDoubleClick`
- `ComputerActionDrag`
- `ComputerActionKeypress`
- `ComputerActionMove`
- `ComputerActionScreenshot`
- `ComputerActionScroll`
- `ComputerActionType`
- `ComputerActionWait`
- `ComputerAction`
- `ComputerCall`
- `ComputerSafetyCheck`
- `ResponseComputerToolCallOutputScreenshot`
- `ComputerCallOutput`
- `WebSearchCallActionSearch`
- `WebSearchCallActionOpenPage`
- `WebSearchCallActionFindInPage`
- `WebSearchCallAction`
- `WebSearchCall`
- `FunctionCall`
- `FunctionCallOutput`
- `ToolSearchCall`
- `ToolSearchOutput`
- `McpListToolsItemTool`
- `McpListTools`
- `McpApprovalRequest`
- `McpApprovalResponse`
- `McpCall`
- `CustomToolCall`
- `CustomToolCallOutput`
- `ImageGenerationCall`
- `CodeInterpreterCallOutputLogs`
- `CodeInterpreterCallOutputImage`
- `CodeInterpreterCallOutput`
- `CodeInterpreterCall`
- `LocalShellCall`
- `LocalShellCallOutput`
- `ShellCallAction`
- `ShellCall`
- `ShellCallOutputOutcome`
- `ShellCallOutputChunk`
- `ShellCallOutput`
- `ApplyPatchCreateFileOperation`
- `ApplyPatchDeleteFileOperation`
- `ApplyPatchUpdateFileOperation`
- `ApplyPatchOperation`
- `ApplyPatchCall`
- `ApplyPatchCallOutput`
- `ItemReference`

Do not move `ContainerAuto`, `LocalEnvironment`, `ContainerReference`, or `ShellCallEnvironment` here; those belong in `environments.ts`.

- [ ] **Step 3: Run a focused typecheck**

Run:

```bash
bun run typecheck
```

Expected: remaining failures should be explainable by the incomplete split and missing barrel. Fix any error caused by a wrong import path before continuing.

## Task 3: Assemble Items, Request, Object, Stream, And Barrel

**Files:**
- Create: `src/protocol/openai/responses/items.ts`
- Create: `src/protocol/openai/responses/request.ts`
- Create: `src/protocol/openai/responses/object.ts`
- Create: `src/protocol/openai/responses/stream.ts`
- Create: `src/protocol/openai/responses/index.ts`
- Read: `src/protocol/openai/responses.ts`
- Test: `bun run typecheck`

- [ ] **Step 1: Create `items.ts`**

Create `src/protocol/openai/responses/items.ts` with this dependency header:

```ts
import type {
	EasyInputMessage,
	ResponseInputMessage,
	ResponseOutputMessage,
} from "./messages";
import type {
	ApplyPatchCall,
	ApplyPatchCallOutput,
	CodeInterpreterCall,
	ComputerCall,
	ComputerCallOutput,
	CustomToolCall,
	CustomToolCallOutput,
	FileSearchCall,
	FunctionCall,
	FunctionCallOutput,
	ImageGenerationCall,
	ItemReference,
	LocalShellCall,
	LocalShellCallOutput,
	McpApprovalRequest,
	McpApprovalResponse,
	McpCall,
	McpListTools,
	ShellCall,
	ShellCallOutput,
	ToolSearchCall,
	ToolSearchOutput,
	WebSearchCall,
} from "./tool-items";
import type {
	Compaction,
	Reasoning,
} from "./reasoning";
```

Move `ResponseItem` unchanged from `src/protocol/openai/responses.ts`.

- [ ] **Step 2: Create `request.ts`**

Create `src/protocol/openai/responses/request.ts` with this dependency header:

```ts
import type { ResponsesModel } from "../models";
import type {
	Metadata,
	PromptCacheRetention,
	ReasoningEffort,
	ReasoningSummary,
	ResponseFormatTextConfig,
	ServiceTier,
	TruncationStrategy,
	Verbosity,
} from "../shared";
import type {
	ResponseInputContent,
} from "./content";
import type {
	InputItemBase,
} from "./messages";
import type { ResponseItem } from "./items";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "./tools";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `ResponseIncludable`
- `ResponseCreateRequest`

- [ ] **Step 3: Create `object.ts`**

Create `src/protocol/openai/responses/object.ts` with this dependency header:

```ts
import type {
	Metadata,
	PromptCacheRetention,
	ReasoningEffort,
	ReasoningSummary,
	ResponseError,
	ResponseFormatTextConfig,
	ServiceTier,
	TruncationStrategy,
	Verbosity,
} from "../shared";
import type { ResponseInputContent } from "./content";
import type { ResponseItem } from "./items";
import type { ResponseIncludable } from "./request";
import type { SummaryTextContent } from "./reasoning";
import type {
	ResponseTool,
	ResponseToolChoice,
} from "./tools";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `ResponseIncompleteDetails`
- `ResponseStatus`
- `ResponseInputTokensDetails`
- `ResponseOutputTokensDetails`
- `ResponseUsage`
- `ResponseInstructions`
- `ResponseObject`

- [ ] **Step 4: Create `stream.ts`**

Create `src/protocol/openai/responses/stream.ts` with this dependency header:

```ts
import type { ResponseError } from "../shared";
import type {
	ResponseOutputContent,
	ResponseTokenLogprob,
} from "./content";
import type { ResponseItem } from "./items";
import type { ResponseObject } from "./object";
import type {
	ReasoningTextContent,
	SummaryTextContent,
} from "./reasoning";
```

Move these definitions unchanged from `src/protocol/openai/responses.ts`:

- `ResponseStreamEventType`
- `ResponseStreamEvent`

- [ ] **Step 5: Create `responses/index.ts`**

Create `src/protocol/openai/responses/index.ts` as the only re-export file in the Responses subdomain:

```ts
export * from "./content";
export * from "./environments";
export * from "./items";
export * from "./messages";
export * from "./object";
export * from "./reasoning";
export * from "./request";
export * from "./stream";
export * from "./tool-items";
export * from "./tools";
```

- [ ] **Step 6: Run a focused typecheck**

Run:

```bash
bun run typecheck
```

Expected: failures should now be limited to duplicate definitions caused by the old `responses.ts` file still existing, or to import mistakes in the new modules. Fix import mistakes before deleting the old file.

## Task 4: Delete The Old File And Verify The Canonical Entry Point

**Files:**
- Delete: `src/protocol/openai/responses.ts`
- Modify: `src/protocol/openai/index.ts`
- Test: `src/module-boundaries.test.ts`
- Test: `bun run typecheck`

- [ ] **Step 1: Delete `responses.ts`**

Run:

```bash
rm src/protocol/openai/responses.ts
```

Expected: `git status --short` shows `D src/protocol/openai/responses.ts` and added files under `src/protocol/openai/responses/`.

- [ ] **Step 2: Keep the root OpenAI barrel unchanged unless typecheck proves otherwise**

Verify `src/protocol/openai/index.ts` is exactly:

```ts
// ============================================================
// OpenAI Protocol Types - Barrel Exports
// ============================================================

export * from "./completions";
export * from "./models";
export * from "./responses";
export * from "./shared";
```

If Biome rewrites the dash in the comment, accept the formatter output. Do not add non-index re-export files.

- [ ] **Step 3: Run the module boundary test**

Run:

```bash
bun test src/module-boundaries.test.ts
```

Expected: PASS. This proves every new subdirectory has an `index.ts`, only index barrels re-export modules, and no session runtime helpers leak through the protocol barrel.

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS. If TypeScript cannot resolve `protocol/openai/responses` to the directory entry point after deleting the file, update application imports from `.../protocol/openai/responses` to `.../protocol/openai` in one mechanical pass, then rerun this command.

## Task 5: Normalize Imports If Directory Resolution Needs It

**Files:**
- Modify: files returned by `rg -n "protocol/openai/responses" src --glob '*.ts'`
- Test: `bun run typecheck`

Run this task only if Task 4 Step 4 proves that importing `.../protocol/openai/responses` does not resolve to `responses/index.ts` in this TypeScript/Bun configuration.

- [ ] **Step 1: List affected imports**

Run:

```bash
rg -n "protocol/openai/responses" src --glob '*.ts'
```

Expected: the command lists type-only imports from adapter, context, provider, server, session, and shared helper modules.

- [ ] **Step 2: Convert application imports to the root OpenAI protocol barrel**

For each listed import outside `src/protocol/openai/responses/`, change only the module specifier:

```ts
from "../protocol/openai/responses"
```

to the depth-correct root barrel:

```ts
from "../protocol/openai"
```

Preserve the exact imported type names. For example:

```ts
import type { ResponseObject } from "../protocol/openai/responses";
```

becomes:

```ts
import type { ResponseObject } from "../protocol/openai";
```

For deeper paths, keep the relative depth correct:

```ts
import type { ResponseStreamEvent } from "../../protocol/openai/responses";
```

becomes:

```ts
import type { ResponseStreamEvent } from "../../protocol/openai";
```

- [ ] **Step 3: Verify no application module imports Responses leaves**

Run:

```bash
rg -n "protocol/openai/responses/(content|environments|items|messages|object|reasoning|request|stream|tool-items|tools)" src --glob '*.ts'
```

Expected: no output. Leaf imports should stay inside `src/protocol/openai/responses/`.

- [ ] **Step 4: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

## Task 6: Full Verification And Commit

**Files:**
- Verify: all changed files
- Test: `bun run check`
- Test: `git diff --check`

- [ ] **Step 1: Format and lint source**

Run:

```bash
bun run lint:fix
```

Expected: Biome completes without remaining diagnostics.

- [ ] **Step 2: Run full check**

Run:

```bash
bun run check
```

Expected: typecheck passes, Biome check passes, and the unit test suite passes.

- [ ] **Step 3: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Inspect the final diff**

Run:

```bash
git status --short
git diff --stat
git diff -- src/protocol/openai/index.ts src/protocol/openai/responses.ts src/protocol/openai/responses
```

Expected:

- `src/protocol/openai/responses.ts` is deleted.
- `src/protocol/openai/responses/` contains focused modules and `index.ts`.
- `src/protocol/openai/index.ts` remains a pure barrel.
- No behavior code outside protocol imports changed unless Task 5 was required by type resolution.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/protocol/openai docs/superpowers/plans/2026-05-27-openai-protocol-refactor.md
git commit -m "refactor(protocol): split openai responses types"
```

Expected: commit succeeds on branch `refactor/protocol-openai`.

## Plan Self-Review

- Spec coverage: the plan creates the `responses/` subdomain, removes `responses.ts`, keeps the root OpenAI barrel, prevents non-index re-export files, protects the `ResponseItem` union boundary, and runs `bun run check`.
- Type consistency: all new module names match the approved design. `ResponseTool`, `ResponseToolChoice`, `ResponseCreateRequest`, `ResponseObject`, `ResponseUsage`, `ResponseItem`, and `ResponseStreamEvent` stay exported through the Responses domain barrel.
- Scope check: the plan only moves OpenAI Responses protocol types. It does not change mapper, provider, adapter, server, trace, session, or runtime behavior.
