# Web Search Built-In Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add provider-native and GodeX-managed web search support for Responses-compatible requests.

**Architecture:** Keep compatibility decisions in `src/bridge/tools`, search execution in a new `src/search` boundary, and model continuation orchestration in `src/responses`. Provider-native search remains behind provider accessors; non-native providers use an internal web-search function call that GodeX executes and feeds back into the model.

**Tech Stack:** TypeScript, Bun test runner, Biome, existing GodeX `ProviderSpec`, `ResponsesContext`, `ProviderExchange`, `SyncRequestPipeline`, and `StreamPipeline`.

---

## File Structure

- Create `src/config/sections/web-search.ts`: parse and validate the top-level `web_search` config.
- Create `src/config/sections/web-search.test.ts`: parser defaults and invalid config tests.
- Modify `src/config/schema.ts`: add `WebSearchConfig`.
- Modify `src/config/builder.ts`: parse `web_search` into `GodeXConfig`.
- Create `src/search/types.ts`: provider-neutral search request/result contracts.
- Create `src/search/none-provider.ts`: explicit unavailable backend.
- Create `src/search/mock-provider.ts`: deterministic test backend.
- Create `src/search/registry.ts`: build `SearchService` from config.
- Create `src/search/index.ts`: barrel exports.
- Create `src/search/*.test.ts`: registry, timeout, mock behavior.
- Modify `src/context/application-services.ts`: create and expose search service.
- Modify `src/context/application-context.ts`: add `search` service field.
- Modify `src/context/test-fixtures.ts`: add `web_search` defaults to shared config fixtures.
- Modify `src/context/application-services.test.ts`: add `web_search` defaults to inline config literals.
- Modify `src/context/application-context.test.ts`: add `web_search` defaults to inline config literals.
- Create `src/bridge/tools/web-search.ts`: internal web-search function schema and helpers.
- Modify `src/bridge/tools/tool-plan.ts`: model web-search execution as provider-native, GodeX-managed, client fallback, ignored, or rejected.
- Modify `src/bridge/tools/declaration-renderer.ts`: render internal web-search function declaration without using generic schemas.
- Modify `src/bridge/tools/tool-identity.ts`: preserve execution mode for restored calls.
- Modify `src/bridge/tools/call-restorer.ts`: restore client fallback search calls as `function_call`, not hosted `web_search_call`.
- Modify `src/bridge/request/request-builder.ts`: pass web-search planning options into tool planning.
- Modify `src/responses/provider-exchange.ts`: allow request/session overrides for continuation calls without mutating `ResponsesContext`.
- Create `src/responses/web-search/`: hosted loop helpers for call detection, search execution, continuation request construction, response item creation, and trace events.
- Modify `src/responses/sync-request-pipeline.ts`: run hosted search loop before final reconstruction.
- Modify `src/responses/stream-pipeline.ts`: use a hosted stream orchestrator before existing validation/logging/session transformers.
- Modify `src/bridge/provider-spec/contract.ts`: add optional native search output accessor if no narrower extension works.
- Modify `src/providers/zhipu/hooks.ts`: extract Zhipu native web search results into standard `web_search_call` items.
- Modify `src/providers/zhipu/spec.ts`: expose the optional native search output accessor.
- Add focused unit tests near each modified module.
- Add mocked E2E coverage in `src/e2e/e2e.test.ts` or provider-specific E2E files.
- Update docs after behavior lands: `docs/architecture/responses-bridge-kernel.md` and the README compatibility feature list.

## Task 1: Web Search Config

**Files:**
- Create: `src/config/sections/web-search.ts`
- Create: `src/config/sections/web-search.test.ts`
- Modify: `src/config/sections/index.ts`
- Modify: `src/config/schema.ts`
- Modify: `src/config/builder.ts`
- Modify: `src/config/builder.test.ts`
- Modify fixtures that construct `GodeXConfig` directly under `src/context/`, `src/cli/`, and `src/server/` tests only when TypeScript requires the new field.

- [ ] **Step 1: Write failing parser tests**

Create `src/config/sections/web-search.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import {
	DEFAULT_WEB_SEARCH_CONFIG,
	parseWebSearchConfig,
} from "./web-search";

describe("parseWebSearchConfig", () => {
	test("uses safe compatibility defaults", () => {
		expect(parseWebSearchConfig(undefined)).toEqual(DEFAULT_WEB_SEARCH_CONFIG);
	});

	test("parses a complete web_search section", () => {
		expect(
			parseWebSearchConfig({
				enabled: false,
				mode: "godex_managed",
				provider: "mock",
				on_unavailable: "fail",
				max_iterations: 3,
				timeout_ms: 2500,
			}),
		).toEqual({
			enabled: false,
			mode: "godex_managed",
			provider: "mock",
			on_unavailable: "fail",
			max_iterations: 3,
			timeout_ms: 2500,
		});
	});

	test("rejects unsupported real provider IDs until implemented", () => {
		expect(() => parseWebSearchConfig({ provider: "brave" })).toThrow(
			/web_search.provider/,
		);
	});

	test("rejects invalid max_iterations and timeout_ms values", () => {
		expect(() => parseWebSearchConfig({ max_iterations: 0 })).toThrow(
			/web_search.max_iterations/,
		);
		expect(() => parseWebSearchConfig({ timeout_ms: -1 })).toThrow(
			/web_search.timeout_ms/,
		);
	});
});
```

- [ ] **Step 2: Run the failing config test**

Run:

```bash
bun test src/config/sections/web-search.test.ts
```

Expected: FAIL because `src/config/sections/web-search.ts` does not exist.

- [ ] **Step 3: Implement parser and schema**

Create `src/config/sections/web-search.ts`:

```ts
import { asConfigObject } from "../raw";
import type { WebSearchConfig } from "../schema";

export const DEFAULT_WEB_SEARCH_CONFIG: WebSearchConfig = {
	enabled: true,
	mode: "auto",
	provider: "none",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 10000,
};

const MODES = new Set(["auto", "provider_native", "godex_managed", "disabled"]);
const PROVIDERS = new Set(["none", "mock"]);
const ON_UNAVAILABLE = new Set(["client_tool_call", "fail", "ignore"]);

export function parseWebSearchConfig(raw: unknown): WebSearchConfig {
	const input = asConfigObject(raw);
	return {
		enabled: booleanValue(input.enabled, DEFAULT_WEB_SEARCH_CONFIG.enabled, "web_search.enabled"),
		mode: enumValue(input.mode, MODES, DEFAULT_WEB_SEARCH_CONFIG.mode, "web_search.mode"),
		provider: enumValue(input.provider, PROVIDERS, DEFAULT_WEB_SEARCH_CONFIG.provider, "web_search.provider"),
		on_unavailable: enumValue(input.on_unavailable, ON_UNAVAILABLE, DEFAULT_WEB_SEARCH_CONFIG.on_unavailable, "web_search.on_unavailable"),
		max_iterations: positiveInteger(input.max_iterations, DEFAULT_WEB_SEARCH_CONFIG.max_iterations, "web_search.max_iterations"),
		timeout_ms: positiveInteger(input.timeout_ms, DEFAULT_WEB_SEARCH_CONFIG.timeout_ms, "web_search.timeout_ms"),
	};
}

function booleanValue(value: unknown, fallback: boolean, path: string): boolean {
	if (value === undefined) return fallback;
	if (typeof value === "boolean") return value;
	throw new Error(`${path} must be a boolean.`);
}

function enumValue<T extends string>(
	value: unknown,
	allowed: ReadonlySet<string>,
	fallback: T,
	path: string,
): T {
	if (value === undefined) return fallback;
	if (typeof value === "string" && allowed.has(value)) return value as T;
	throw new Error(`${path} must be one of: ${[...allowed].join(", ")}.`);
}

function positiveInteger(value: unknown, fallback: number, path: string): number {
	if (value === undefined) return fallback;
	if (Number.isInteger(value) && typeof value === "number" && value > 0) {
		return value;
	}
	throw new Error(`${path} must be a positive integer.`);
}
```

Modify `src/config/schema.ts`:

```ts
export interface WebSearchConfig {
	enabled: boolean;
	mode: "auto" | "provider_native" | "godex_managed" | "disabled";
	provider: "none" | "mock";
	on_unavailable: "client_tool_call" | "fail" | "ignore";
	max_iterations: number;
	timeout_ms: number;
}

export interface GodeXConfig {
	server: ServerConfig;
	default_provider: string;
	models?: ModelsConfig;
	providers: Record<string, ProviderConfig>;
	session: SessionConfig;
	logging: LoggingConfig;
	trace: TraceConfig;
	web_search: WebSearchConfig;
}
```

Modify `src/config/builder.ts`:

```ts
import { parseWebSearchConfig } from "./sections/web-search";

// inside buildConfig return object
web_search: parseWebSearchConfig(file.web_search),
```

Modify `src/config/sections/index.ts` to export the parser:

```ts
export * from "./web-search";
```

- [ ] **Step 4: Update builder tests**

Add to `src/config/builder.test.ts` expected configs:

```ts
web_search: {
	enabled: true,
	mode: "auto",
	provider: "none",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 10000,
},
```

Add a parsing assertion:

```ts
const config = buildConfig(
	{
		providers: {},
		web_search: { provider: "mock", on_unavailable: "fail" },
	},
	{},
);
expect(config.web_search.provider).toBe("mock");
expect(config.web_search.on_unavailable).toBe("fail");
```

- [ ] **Step 5: Run config tests**

Run:

```bash
bun test src/config/sections/web-search.test.ts src/config/builder.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit config slice**

Run:

```bash
git add src/config
git commit -m "feat(config): add web search settings"
```

## Task 2: Search Service Boundary

**Files:**
- Create: `src/search/types.ts`
- Create: `src/search/none-provider.ts`
- Create: `src/search/mock-provider.ts`
- Create: `src/search/registry.ts`
- Create: `src/search/index.ts`
- Create: `src/search/registry.test.ts`
- Modify: `src/context/application-services.ts`
- Modify: `src/context/application-context.ts`
- Modify: `src/context/application-services.test.ts`
- Modify: `src/context/application-context.test.ts`

- [ ] **Step 1: Write failing search registry tests**

Create `src/search/registry.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { WebSearchConfig } from "../config";
import { createSearchService } from "./registry";

const config: WebSearchConfig = {
	enabled: true,
	mode: "auto",
	provider: "mock",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 1000,
};

describe("createSearchService", () => {
	test("creates an executable mock provider", async () => {
		const service = createSearchService(config);

		expect(service.available).toBe(true);
		const result = await service.search({
			query: "bun latest",
			contextSize: "medium",
			contentTypes: ["text"],
		});

		expect(result.results[0]).toMatchObject({
			url: "https://example.com/search/bun-latest",
		});
	});

	test("creates an unavailable service for provider none", async () => {
		const service = createSearchService({ ...config, provider: "none" });

		expect(service.available).toBe(false);
		await expect(
			service.search({
				query: "bun",
				contextSize: "medium",
				contentTypes: ["text"],
			}),
		).rejects.toThrow(/not configured/);
	});
});
```

- [ ] **Step 2: Run failing search registry test**

Run:

```bash
bun test src/search/registry.test.ts
```

Expected: FAIL because `src/search/registry.ts` does not exist.

- [ ] **Step 3: Implement search contracts and providers**

Create `src/search/types.ts`:

```ts
export interface SearchProvider {
	readonly name: string;
	search(request: SearchRequest, signal?: AbortSignal): Promise<SearchResponse>;
}

export interface SearchRequest {
	readonly query: string;
	readonly queries?: readonly string[];
	readonly allowedDomains?: readonly string[];
	readonly contextSize: "low" | "medium" | "high";
	readonly contentTypes: readonly ("text" | "image")[];
	readonly userLocation?: unknown;
}

export interface SearchResult {
	readonly title?: string;
	readonly url: string;
	readonly snippet?: string;
	readonly publishedAt?: string;
}

export interface SearchResponse {
	readonly query: string;
	readonly results: readonly SearchResult[];
}

export interface SearchService extends SearchProvider {
	readonly available: boolean;
}
```

Create `src/search/none-provider.ts`:

```ts
import type { SearchRequest, SearchResponse, SearchService } from "./types";

export class NoneSearchProvider implements SearchService {
	readonly name = "none";
	readonly available = false;

	async search(_request: SearchRequest): Promise<SearchResponse> {
		throw new Error("web_search provider is not configured.");
	}
}
```

Create `src/search/mock-provider.ts`:

```ts
import type { SearchRequest, SearchResponse, SearchService } from "./types";

export class MockSearchProvider implements SearchService {
	readonly name = "mock";
	readonly available = true;

	async search(request: SearchRequest): Promise<SearchResponse> {
		const slug = request.query.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
		return {
			query: request.query,
			results: [
				{
					title: `Mock result for ${request.query}`,
					url: `https://example.com/search/${slug || "query"}`,
					snippet: `Deterministic mock search result for ${request.query}.`,
				},
			],
		};
	}
}
```

Create `src/search/registry.ts`:

```ts
import type { WebSearchConfig } from "../config";
import { MockSearchProvider } from "./mock-provider";
import { NoneSearchProvider } from "./none-provider";
import type { SearchService } from "./types";

export function createSearchService(config: WebSearchConfig): SearchService {
	if (!config.enabled || config.provider === "none") return new NoneSearchProvider();
	if (config.provider === "mock") return new MockSearchProvider();
	return new NoneSearchProvider();
}
```

Create `src/search/index.ts`:

```ts
export * from "./types";
export * from "./registry";
export * from "./none-provider";
export * from "./mock-provider";
```

- [ ] **Step 4: Inject search service into application context**

Modify `src/context/application-services.ts`:

```ts
import { createSearchService, type SearchService } from "../search";

export interface ApplicationServices {
	logger: Logger;
	resolver: ModelResolver;
	registrar: Registrar;
	responses: ResponsesBridge;
	sessionStore: ResponseSessionStore;
	traceRecorder: TraceRecorder;
	traceEnabled: boolean;
	search: SearchService;
}

// inside createApplicationServices return object
search: createSearchService(config.web_search),
```

Modify `src/context/application-context.ts`:

```ts
import type { SearchService } from "../search";

export class ApplicationContext {
	readonly search: SearchService;

	constructor(config: GodeXConfig, registrar?: Registrar) {
		const services = createApplicationServices(config, registrar);
		this.search = services.search;
	}
}
```

- [ ] **Step 5: Run search and context tests**

Run:

```bash
bun test src/search/registry.test.ts src/context/application-services.test.ts src/context/application-context.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit search service slice**

Run:

```bash
git add src/search src/context
git commit -m "feat(search): add web search service boundary"
```

## Task 3: Tool Planning For Native, Managed, And Client Fallback Search

**Files:**
- Create: `src/bridge/tools/web-search.ts`
- Modify: `src/bridge/tools/tool-plan.ts`
- Modify: `src/bridge/tools/tool-identity.ts`
- Modify: `src/bridge/tools/declaration-renderer.ts`
- Modify: `src/bridge/tools/call-restorer.ts`
- Modify: `src/bridge/tools/tool-plan.test.ts`
- Modify: `src/bridge/tools/call-restorer.test.ts`
- Modify: `src/bridge/request/request-builder.ts`
- Modify: `src/responses/provider-exchange.ts`

- [ ] **Step 1: Write failing tool planning tests**

Add to `src/bridge/tools/tool-plan.test.ts`:

```ts
test("renders GodeX-managed web search as a strict internal function declaration", () => {
	const plan = planTools({
		tools: [{ type: "web_search", search_context_size: "high" }],
		profile: {
			...kernelProfile,
			nativeToolTypes: new Set(["function"]),
			degradedToolTypes: new Map(),
			webSearch: {
				mode: "godex_managed",
				available: true,
				onUnavailable: "client_tool_call",
			},
		},
	});

	expect(plan.declarations[0]).toMatchObject({
		requestedType: "web_search",
		providerType: "function",
		providerName: "web_search",
		execution: "godex_managed",
	});
	expect(renderProviderToolDeclarations(plan.declarations)).toEqual([
		{
			type: "function",
			function: {
				name: "web_search",
				description: expect.stringContaining("Search the web"),
				parameters: expect.objectContaining({
					type: "object",
					required: ["query"],
					additionalProperties: false,
				}),
			},
		},
	]);
});

test("falls back to a client function call when managed search is unavailable by default", () => {
	const plan = planTools({
		tools: [{ type: "web_search_preview" }],
		profile: {
			...kernelProfile,
			nativeToolTypes: new Set(["function"]),
			degradedToolTypes: new Map(),
			webSearch: {
				mode: "auto",
				available: false,
				onUnavailable: "client_tool_call",
			},
		},
	});

	expect(plan.declarations[0]).toMatchObject({
		requestedType: "web_search_preview",
		providerType: "function",
		providerName: "web_search",
		execution: "client",
	});
	expect(plan.decisions.at(-1)).toMatchObject({
		action: "degraded",
		path: "tools[type=web_search_preview]",
	});
});
```

Add to `src/bridge/tools/call-restorer.test.ts`:

```ts
test("restores client fallback web search as function_call", () => {
	const identities = new ToolIdentityMap();
	identities.addDeclarations([
		{
			requestedType: "web_search",
			providerType: "function",
			requestedName: "web_search_0",
			providerName: "web_search",
			execution: "client",
			tool: { type: "web_search" },
		},
	]);

	expect(
		restoreToolCall(
			{
				callId: "call_search",
				name: "web_search",
				arguments: JSON.stringify({ query: "latest bun release" }),
			},
			identities,
		),
	).toEqual({
		type: "function_call",
		call_id: "call_search",
		name: "web_search",
		arguments: JSON.stringify({ query: "latest bun release" }),
	});
});
```

- [ ] **Step 2: Run failing bridge tool tests**

Run:

```bash
bun test src/bridge/tools/tool-plan.test.ts src/bridge/tools/call-restorer.test.ts
```

Expected: FAIL because web-search planning options and execution identities do not exist.

- [ ] **Step 3: Add web-search tool helpers**

Create `src/bridge/tools/web-search.ts`:

```ts
import type { ResponseTool } from "../../protocol/openai/responses";

export const WEB_SEARCH_FUNCTION_NAME = "web_search";

export function isWebSearchTool(tool: ResponseTool): boolean {
	return (
		tool.type === "web_search" ||
		tool.type === "web_search_2025_08_26" ||
		tool.type === "web_search_preview" ||
		tool.type === "web_search_preview_2025_03_11"
	);
}

export function webSearchFunctionParameters(): Record<string, unknown> {
	return {
		type: "object",
		properties: {
			query: {
				type: "string",
				description: "The web search query.",
			},
			queries: {
				type: "array",
				items: { type: "string" },
				description: "Optional additional search queries.",
			},
		},
		required: ["query"],
		additionalProperties: false,
	};
}

export function webSearchFunctionDescription(): string {
	return "Search the web for current information and return source URLs and snippets.";
}
```

- [ ] **Step 4: Extend tool plan data model**

Modify `src/bridge/tools/tool-plan.ts`:

```ts
export type ToolExecutionMode = "provider" | "godex_managed" | "client";

export interface WebSearchPlanningOptions {
	readonly mode: "auto" | "provider_native" | "godex_managed" | "disabled";
	readonly available: boolean;
	readonly onUnavailable: "client_tool_call" | "fail" | "ignore";
}

export interface ToolPlanningProfile {
	readonly provider: string;
	readonly nativeToolTypes: ReadonlySet<string>;
	readonly degradedToolTypes: ReadonlyMap<string, string>;
	readonly toolChoice: ReadonlySet<string>;
	readonly maxTools?: number;
	readonly toProviderName?: (name: string) => string;
	readonly webSearch?: WebSearchPlanningOptions;
}

export interface ToolDeclarationPlan {
	readonly requestedType: string;
	readonly providerType: string;
	readonly requestedName: string;
	readonly providerName: string;
	readonly tool: ResponseTool;
	readonly execution: ToolExecutionMode;
}
```

In native and degraded branches, set `execution: "provider"`.

Before the unsupported-tool `ignored` branch, add:

```ts
const webSearchPlan = planWebSearchDeclaration(entry, profile, decisions);
if (webSearchPlan) return [webSearchPlan];
```

Implement `planWebSearchDeclaration()` in the same file or a focused helper:

```ts
function planWebSearchDeclaration(
	entry: ToolCatalogEntry,
	profile: ToolPlanningProfile,
	decisions: PlannedToolDecision[],
): ToolDeclarationPlan | null {
	if (!isWebSearchTool(entry.tool) || !profile.webSearch) return null;
	if (profile.webSearch.mode === "disabled") {
		return unavailableWebSearch(entry, profile, decisions);
	}
	if (profile.webSearch.mode === "provider_native") {
		return unavailableWebSearch(entry, profile, decisions);
	}
	if (profile.webSearch.available) {
		decisions.push({
			path: `tools[type=${entry.type}]`,
			action: "degraded",
			reason: `${profile.provider} maps Responses tool '${entry.type}' to GodeX-managed web search.`,
		});
		return {
			requestedType: entry.type,
			providerType: "function",
			requestedName: entry.name,
			providerName: WEB_SEARCH_FUNCTION_NAME,
			tool: entry.tool,
			execution: "godex_managed",
		};
	}
	return unavailableWebSearch(entry, profile, decisions);
}
```

Use `BridgeError` in `unavailableWebSearch()` for `onUnavailable === "fail"`, return `null` for `ignore`, and return a `client` function declaration for `client_tool_call`.

- [ ] **Step 5: Render web-search function declarations**

Modify `src/bridge/tools/declaration-renderer.ts` so `functionDeclaration()` receives the full plan:

```ts
case "function":
	return functionDeclaration(plan);
```

Add this branch before built-in function lookup:

```ts
if (isWebSearchTool(plan.tool) && plan.providerType === "function") {
	return {
		type: "function",
		function: {
			name: plan.providerName,
			description: webSearchFunctionDescription(),
			parameters: webSearchFunctionParameters(),
		},
	};
}
```

- [ ] **Step 6: Preserve execution identity**

Modify `src/bridge/tools/tool-identity.ts` to include execution:

```ts
export interface ToolIdentity {
	readonly requestedType: string;
	readonly requestedName: string;
	readonly providerType: string;
	readonly providerName: string;
	readonly execution: ToolExecutionMode;
}
```

When adding declarations, default older declarations to `execution: declaration.execution ?? "provider"` if tests construct partial objects.

Modify `src/bridge/tools/call-restorer.ts`:

```ts
if (isWebSearchRequested(identity) && identity.execution === "client") {
	return fallbackFunctionCall(call, "web_search");
}
```

Do not restore GodeX-managed search calls here; hosted loop code consumes them before public reconstruction. If a GodeX-managed search call reaches `restoreToolCall()`, restore it as `function_call` with name `web_search` so the response remains debuggable instead of throwing from the reconstructor.

- [ ] **Step 7: Pass config into request build planning**

Modify `src/bridge/request/request-builder.ts`:

```ts
import type { WebSearchPlanningOptions } from "../tools";

export interface BuildChatCompletionRequestInput {
	readonly request: ResponseCreateRequest;
	readonly provider: string;
	readonly model: string;
	readonly capabilities: ProviderCapabilities;
	readonly profile: ToolPlanningProfile;
	readonly session?: ResponseSessionSnapshot | null;
	readonly webSearch?: WebSearchPlanningOptions;
}

// when calling planTools
profile: {
	...input.profile,
	webSearch: input.webSearch,
},
```

Modify `src/responses/provider-exchange.ts` to compute:

```ts
webSearch: webSearchPlanningOptions(ctx),
```

where `webSearchPlanningOptions(ctx)` maps `ctx.app.config.web_search` and `ctx.app.search.available` to the bridge options.

- [ ] **Step 8: Run bridge tests**

Run:

```bash
bun test src/bridge/tools/tool-plan.test.ts src/bridge/tools/call-restorer.test.ts src/bridge/request/request-builder.test.ts src/responses/provider-exchange.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit tool planning slice**

Run:

```bash
git add src/bridge src/responses/provider-exchange.ts
git commit -m "feat(bridge): plan managed web search tools"
```

## Task 4: Sync Hosted Search Loop

**Files:**
- Create: `src/responses/web-search/calls.ts`
- Create: `src/responses/web-search/continuation.ts`
- Create: `src/responses/web-search/sync-runner.ts`
- Create: `src/responses/web-search/trace.ts`
- Create: `src/responses/web-search/index.ts`
- Create: `src/responses/web-search/sync-runner.test.ts`
- Modify: `src/responses/provider-exchange.ts`
- Modify: `src/responses/sync-request-pipeline.ts`
- Modify: `src/responses/sync-request-pipeline.test.ts`

- [ ] **Step 1: Write failing sync hosted loop tests**

Create `src/responses/web-search/sync-runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { HostedWebSearchSyncRunner } from "./sync-runner";

describe("HostedWebSearchSyncRunner", () => {
	test("executes one managed search call and returns final response", async () => {
		const calls: unknown[] = [];
		const exchange = {
			async request(ctx: any, options?: any) {
				calls.push(options?.request ?? ctx.request);
				if (calls.length === 1) {
					return {
						built: managedSearchBuilt(),
						providerResponse: providerToolCallResponse({
							callId: "call_search",
							name: "web_search",
							argumentsValue: JSON.stringify({ query: "latest bun release" }),
						}),
					};
				}
				return {
					built: managedSearchBuilt(),
					providerResponse: providerTextResponse("Bun latest release is listed in the search result."),
				};
			},
		};
		const ctx = createHostedSearchTestContext();
		const runner = new HostedWebSearchSyncRunner(exchange as any);

		const result = await runner.request(ctx);

		expect(result.response.output.some((item) => item.type === "web_search_call")).toBe(true);
		expect(result.response.output_text).toContain("Bun latest");
		expect(calls).toHaveLength(2);
	});

	test("returns client fallback unchanged when search execution is client-visible", async () => {
		const exchange = {
			async request() {
				return {
					built: clientFallbackBuilt(),
					providerResponse: providerToolCallResponse({
						callId: "call_search",
						name: "web_search",
						argumentsValue: JSON.stringify({ query: "latest bun release" }),
					}),
				};
			},
		};
		const ctx = createHostedSearchTestContext({ searchAvailable: false });
		const runner = new HostedWebSearchSyncRunner(exchange as any);

		const result = await runner.request(ctx);

		expect(result.response.output).toContainEqual(
			expect.objectContaining({
				type: "function_call",
				name: "web_search",
			}),
		);
	});
});
```

Place test helpers in the same file. They should build minimal fake `ResponsesContext`, `BuildChatCompletionRequestResult`, and provider responses matching existing `response-reconstructor.test.ts` shapes.

- [ ] **Step 2: Run failing sync hosted loop test**

Run:

```bash
bun test src/responses/web-search/sync-runner.test.ts
```

Expected: FAIL because `HostedWebSearchSyncRunner` does not exist.

- [ ] **Step 3: Add hosted search call helpers**

Create `src/responses/web-search/calls.ts`:

```ts
import type { ProviderFunctionCall } from "../../bridge/tools/call-restorer";
import type { ResponseItem, WebSearchCall } from "../../protocol/openai/responses";

export interface ManagedWebSearchCall {
	readonly providerCall: ProviderFunctionCall;
	readonly query: string;
	readonly queries: readonly string[];
}

export function extractManagedWebSearchCalls(
	output: readonly ResponseItem[],
): ManagedWebSearchCall[] {
	return output.flatMap((item): ManagedWebSearchCall[] => {
		if (item.type !== "function_call" || item.name !== "web_search") return [];
		const parsed = parseArguments(item.arguments);
		if (!parsed.query) return [];
		return [
			{
				providerCall: {
					callId: item.call_id,
					name: item.name,
					arguments: item.arguments,
				},
				query: parsed.query,
				queries: parsed.queries ?? [parsed.query],
			},
		];
	});
}

export function webSearchCallItem(input: {
	readonly responseId: string;
	readonly index: number;
	readonly query: string;
	readonly queries: readonly string[];
	readonly sources?: readonly { readonly url: string }[];
	readonly status: WebSearchCall["status"];
}): WebSearchCall {
	return {
		id: `ws_${input.responseId}_${input.index}`,
		type: "web_search_call",
		status: input.status,
		action: {
			type: "search",
			query: input.query,
			queries: [...input.queries],
			sources: input.sources?.map((source) => ({
				type: "url",
				url: source.url,
			})),
		},
	};
}

function parseArguments(value: string): { query?: string; queries?: string[] } {
	try {
		const parsed = JSON.parse(value);
		if (!isRecord(parsed) || typeof parsed.query !== "string") return {};
		const queries = Array.isArray(parsed.queries)
			? parsed.queries.filter((item): item is string => typeof item === "string")
			: undefined;
		return { query: parsed.query, ...(queries ? { queries } : {}) };
	} catch {
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: Add continuation request helper**

Create `src/responses/web-search/continuation.ts`:

```ts
import type { ResponseCreateRequest, ResponseItem } from "../../protocol/openai/responses";
import type { SearchResponse } from "../../search";

export function buildContinuationRequest(input: {
	readonly original: ResponseCreateRequest;
	readonly previousItems: readonly ResponseItem[];
	readonly callId: string;
	readonly search: SearchResponse;
}): ResponseCreateRequest {
	return {
		...input.original,
		input: [
			...currentInputItems(input.original),
			...input.previousItems,
			{
				type: "function_call_output",
				call_id: input.callId,
				output: searchOutputText(input.search),
			},
		],
	};
}

function currentInputItems(request: ResponseCreateRequest): ResponseItem[] {
	if (request.input === undefined) return [];
	if (typeof request.input === "string") {
		return [{ role: "user", content: request.input }];
	}
	return [...request.input] as ResponseItem[];
}

function searchOutputText(search: SearchResponse): string {
	return JSON.stringify({
		query: search.query,
		results: search.results.map((result) => ({
			title: result.title,
			url: result.url,
			snippet: result.snippet,
			published_at: result.publishedAt,
		})),
	});
}
```

- [ ] **Step 5: Add sync runner**

Create `src/responses/web-search/sync-runner.ts`:

```ts
import { reconstructResponseObject } from "../../bridge/response";
import { BRIDGE_REQUEST_UNSUPPORTED_TOOL, BridgeError } from "../../error";
import type { ResponsesContext } from "../../context/responses-context";
import type { ResponseObject, ResponseItem } from "../../protocol/openai/responses";
import type { SyncProviderExchange } from "../sync-request-pipeline";
import { responseRequestEchoFields } from "../response-request-echo";
import { extractManagedWebSearchCalls, webSearchCallItem } from "./calls";
import { buildContinuationRequest } from "./continuation";

export interface HostedWebSearchSyncResult {
	readonly response: ResponseObject;
}

export class HostedWebSearchSyncRunner {
	constructor(private readonly exchange: SyncProviderExchange) {}

	async request(ctx: ResponsesContext): Promise<HostedWebSearchSyncResult> {
		let request = ctx.request;
		const hostedItems: ResponseItem[] = [];

		for (let iteration = 0; iteration <= ctx.app.config.web_search.max_iterations; iteration++) {
			const { providerResponse, built } = await this.exchange.request(ctx, {
				request,
			});
			const response = reconstructResponseObject({
				requestId: ctx.requestId,
				responseId: ctx.responseId,
				createdAt: ctx.createdAt,
				completedAt: Math.floor(Date.now() / 1000),
				provider: ctx.provider.name,
				model: ctx.resolved.model,
				providerResponse,
				accessor: ctx.provider.spec.response,
				toolIdentity: built.tools,
				outputContract: built.output,
				echo: responseRequestEchoFields(ctx),
			});

			const calls = extractManagedWebSearchCalls(response.output);
			if (calls.length === 0) {
				return { response: { ...response, output: [...hostedItems, ...response.output] } };
			}

			if (iteration >= ctx.app.config.web_search.max_iterations) {
				throw new BridgeError(
					BRIDGE_REQUEST_UNSUPPORTED_TOOL,
					"web_search max_iterations exceeded.",
					{
						provider: ctx.resolved.provider,
						model: ctx.resolved.model,
						parameter: "web_search.max_iterations",
					},
				);
			}

			const [call] = calls;
			const search = await ctx.app.search.search({
				query: call.query,
				queries: call.queries,
				contextSize: "medium",
				contentTypes: ["text"],
			});
			hostedItems.push(
				webSearchCallItem({
					responseId: ctx.responseId,
					index: hostedItems.length,
					query: call.query,
					queries: call.queries,
					sources: search.results.map((result) => ({ url: result.url })),
					status: "completed",
				}),
			);
			request = buildContinuationRequest({
				original: ctx.request,
				previousItems: response.output,
				callId: call.providerCall.callId,
				search,
			});
		}

		throw new BridgeError(
			BRIDGE_REQUEST_UNSUPPORTED_TOOL,
			"web_search loop terminated unexpectedly.",
			{
				provider: ctx.resolved.provider,
				model: ctx.resolved.model,
				parameter: "web_search",
			},
		);
	}
}
```

- [ ] **Step 6: Allow ProviderExchange request overrides**

Modify `src/responses/provider-exchange.ts`:

```ts
export interface ProviderExchangeRequestOptions {
	readonly request?: ResponseCreateRequest;
	readonly session?: ResponseSessionSnapshot | null;
}

async request(
	ctx: ResponsesContext,
	options: ProviderExchangeRequestOptions = {},
): Promise<ProviderRequestExchangeResult> {
	const built = buildProviderRequest(ctx, false, options);
}
```

Update `buildProviderRequest()` to use `options.request ?? ctx.request` and `options.session ?? ctx.session`.

Update `SyncProviderExchange` in `src/responses/sync-request-pipeline.ts` so tests can pass overrides:

```ts
request(
	ctx: ResponsesContext,
	options?: ProviderExchangeRequestOptions,
): Promise<ProviderRequestExchangeResult>;
```

- [ ] **Step 7: Wire sync pipeline**

Modify `src/responses/sync-request-pipeline.ts`:

```ts
import { HostedWebSearchSyncRunner } from "./web-search";

async request(ctx: ResponsesContext): Promise<ResponseObject> {
	const { response } = await new HostedWebSearchSyncRunner(this.exchange).request(ctx);
	validateResponseOutputContract(ctx, ctx.outputContract.current(), response);
	// keep existing usage, logging, diagnostics, session persistence code
}
```

Keep the existing post-reconstruction behavior exactly once: output contract validation, usage trace, info logging, compatibility diagnostics, and session persistence.

- [ ] **Step 8: Run sync tests**

Run:

```bash
bun test src/responses/web-search/sync-runner.test.ts src/responses/sync-request-pipeline.test.ts src/responses/provider-exchange.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit sync hosted loop slice**

Run:

```bash
git add src/responses
git commit -m "feat(responses): execute hosted web search in sync pipeline"
```

## Task 5: Stream Hosted Search Loop

**Files:**
- Create: `src/responses/web-search/stream-runner.ts`
- Create: `src/responses/web-search/stream-runner.test.ts`
- Modify: `src/responses/stream-pipeline.ts`
- Modify: `src/responses/stream-pipeline.test.ts`
- Modify: `src/bridge/stream/response-stream-state-machine.ts`

- [ ] **Step 1: Write failing stream hosted loop test**

Create `src/responses/web-search/stream-runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { HostedWebSearchStreamRunner } from "./stream-runner";

describe("HostedWebSearchStreamRunner", () => {
	test("emits web search lifecycle events before continuation text", async () => {
		const ctx = createHostedSearchTestContext();
		const exchange = createTwoStepStreamExchange({
			first: streamToolCall({ name: "web_search", argumentsValue: JSON.stringify({ query: "latest bun release" }) }),
			second: streamText("Bun latest release is listed in the mock result."),
		});
		const runner = new HostedWebSearchStreamRunner(exchange as any);

		const events = await readResponseEvents(await runner.stream(ctx));

		expect(events.map((event) => event.type)).toEqual(
			expect.arrayContaining([
				"response.web_search_call.in_progress",
				"response.web_search_call.searching",
				"response.web_search_call.completed",
				"response.output_text.delta",
				"response.completed",
			]),
		);
		expect(
			events.find((event) => event.type === "response.output_item.added")?.item,
		).toMatchObject({ type: "web_search_call" });
	});
});
```

Use local helpers that mirror existing `stream-pipeline.test.ts` stream fixtures.

- [ ] **Step 2: Run failing stream hosted loop test**

Run:

```bash
bun test src/responses/web-search/stream-runner.test.ts
```

Expected: FAIL because `HostedWebSearchStreamRunner` does not exist.

- [ ] **Step 3: Implement stream runner skeleton**

Create `src/responses/web-search/stream-runner.ts`:

```ts
import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import {
	mapProviderDeltasToEvents,
	ResponseStreamPhase,
	ResponseStreamStateMachine,
} from "../../bridge/stream";
import { ToolIdentityMap } from "../../bridge/tools";
import type { ResponsesContext } from "../../context/responses-context";
import { BRIDGE_REQUEST_UNSUPPORTED_TOOL, BridgeError } from "../../error";
import type {
	ResponseCreateRequest,
	ResponseItem,
	ResponseStreamEvent,
	WebSearchCall,
} from "../../protocol/openai/responses";
import type { SearchResponse } from "../../search";
import type { StreamProviderExchange } from "../stream-pipeline";
import { responseRequestEchoFields } from "../response-request-echo";
import { extractManagedWebSearchCalls, webSearchCallItem } from "./calls";
import { buildContinuationRequest } from "./continuation";

export interface HostedWebSearchStreamResult {
	readonly stream: ReadableStream<ResponseStreamEvent>;
	readonly machine: ResponseStreamStateMachine;
}

interface ManagedStreamResult {
	readonly managedSearchCall?: {
		readonly callId: string;
		readonly query: string;
		readonly queries: readonly string[];
		readonly search: {
			readonly query: string;
			readonly queries?: readonly string[];
			readonly contextSize: "low" | "medium" | "high";
			readonly contentTypes: readonly ("text" | "image")[];
		};
	};
	readonly continuationRequest: ResponseCreateRequest;
	readonly outputIndex: number;
}

export class HostedWebSearchStreamRunner {
	constructor(private readonly exchange: StreamProviderExchange) {}

	async stream(ctx: ResponsesContext): Promise<HostedWebSearchStreamResult> {
		const self = this;
		const machine = createOuterMachine(ctx);
		const stream = new ReadableStream<ResponseStreamEvent>({
			async start(controller) {
				try {
					await self.run(ctx, machine, controller);
					controller.close();
				} catch (error) {
					controller.error(error);
				}
			},
		});
		return { stream, machine };
	}

	private async run(
		ctx: ResponsesContext,
		machine: ResponseStreamStateMachine,
		controller: TransformStreamDefaultController<ResponseStreamEvent>,
	): Promise<void> {
		let request = ctx.request;
		for (let iteration = 0; iteration <= ctx.app.config.web_search.max_iterations; iteration++) {
			const { providerStream, built } = await this.exchange.stream(ctx, { request });
			const toolIdentities = new ToolIdentityMap();
			toolIdentities.addDeclarations(built.tools.declarations);
			machine.replaceToolIdentities(toolIdentities);

			const result = await consumeProviderStream({
				ctx,
				providerStream,
				machine,
				controller,
				request,
			});

			if (!result.managedSearchCall) return;
			if (iteration >= ctx.app.config.web_search.max_iterations) {
				throw new BridgeError(
					BRIDGE_REQUEST_UNSUPPORTED_TOOL,
					"web_search max_iterations exceeded.",
					{
						provider: ctx.resolved.provider,
						model: ctx.resolved.model,
						parameter: "web_search.max_iterations",
					},
				);
			}

			const search = await ctx.app.search.search(result.managedSearchCall.search);
			emitWebSearchLifecycle({
				controller,
				item: completedWebSearchItem(ctx, result.managedSearchCall, search),
				outputIndex: result.outputIndex,
			});
			request = buildContinuationRequest({
				original: ctx.request,
				previousItems: machine.snapshot.output,
				callId: result.managedSearchCall.callId,
				search,
			});
		}
	}
}
```

Add `createOuterMachine()` and `consumeProviderStream()` in the same file:

```ts
function createOuterMachine(ctx: ResponsesContext): ResponseStreamStateMachine {
	return new ResponseStreamStateMachine({
		responseId: ctx.responseId,
		createdAt: ctx.createdAt,
		model: ctx.resolved.model,
		provider: ctx.provider.name,
		echo: responseRequestEchoFields(ctx),
	});
}

async function consumeProviderStream(input: {
	readonly ctx: ResponsesContext;
	readonly providerStream: ReadableStream<JsonServerSentEvent<unknown>>;
	readonly machine: ResponseStreamStateMachine;
	readonly controller: TransformStreamDefaultController<ResponseStreamEvent>;
	readonly request: ResponseCreateRequest;
}): Promise<ManagedStreamResult> {
	const reader = input.providerStream.getReader();
	let outputIndex = input.machine.snapshot.output.length;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			const deltas = input.ctx.provider.spec.stream.deltas(value.data);
			for (const event of mapProviderDeltasToEvents({
				machine: input.machine,
				deltas,
				deferTerminal: true,
			})) {
				const managed = managedWebSearchFromEvent(event);
				if (managed) {
					return {
						managedSearchCall: {
							callId: managed.callId,
							query: managed.query,
							queries: managed.queries,
							search: {
								query: managed.query,
								queries: managed.queries,
								contextSize: "medium",
								contentTypes: ["text"],
							},
						},
						continuationRequest: buildContinuationRequest({
							original: input.request,
							previousItems: input.machine.snapshot.output,
							callId: managed.callId,
							search: {
								query: managed.query,
								results: [],
							},
						}),
						outputIndex,
					};
				}
				input.controller.enqueue(event);
				if (event.type === "response.output_item.added") outputIndex += 1;
			}
		}
		for (const event of input.machine.finish(input.machine.deferredFinishReason)) {
			input.controller.enqueue(event);
		}
		return {
			continuationRequest: input.request,
			outputIndex,
		};
	} finally {
		reader.releaseLock();
	}
}

function managedWebSearchFromEvent(event: ResponseStreamEvent):
	| { readonly callId: string; readonly query: string; readonly queries: readonly string[] }
	| null {
	if (event.type !== "response.output_item.done") return null;
	const item = event.item;
	if (!item || item.type !== "function_call" || item.name !== "web_search") return null;
	const calls = extractManagedWebSearchCalls([item]);
	const [call] = calls;
	return call
		? {
				callId: call.providerCall.callId,
				query: call.query,
				queries: call.queries,
			}
		: null;
}
```

After executing `ctx.app.search.search()`, rebuild `request` with the real search response:

```ts
request = buildContinuationRequest({
	original: ctx.request,
	previousItems: machine.snapshot.output,
	callId: result.managedSearchCall.callId,
	search,
});
```

- [ ] **Step 4: Add web-search SSE lifecycle helper**

In `src/responses/web-search/stream-runner.ts`, add:

```ts
function emitWebSearchLifecycle(input: {
	readonly controller: TransformStreamDefaultController<ResponseStreamEvent>;
	readonly item: WebSearchCall;
	readonly outputIndex: number;
}): void {
	input.controller.enqueue({
		type: "response.output_item.added",
		output_index: input.outputIndex,
		item: input.item,
	});
	input.controller.enqueue({
		type: "response.web_search_call.in_progress",
		output_index: input.outputIndex,
		item_id: input.item.id,
		item: { ...input.item, status: "in_progress" },
	});
	input.controller.enqueue({
		type: "response.web_search_call.searching",
		output_index: input.outputIndex,
		item_id: input.item.id,
		item: { ...input.item, status: "searching" },
	});
	input.controller.enqueue({
		type: "response.web_search_call.completed",
		output_index: input.outputIndex,
		item_id: input.item.id,
		item: { ...input.item, status: "completed" },
	});
	input.controller.enqueue({
		type: "response.output_item.done",
		output_index: input.outputIndex,
		item: { ...input.item, status: "completed" },
	});
}
```

Add `completedWebSearchItem()` in `src/responses/web-search/stream-runner.ts`:

```ts
function completedWebSearchItem(
	ctx: ResponsesContext,
	call: NonNullable<ManagedStreamResult["managedSearchCall"]>,
	search: SearchResponse,
): WebSearchCall {
	return webSearchCallItem({
		responseId: ctx.responseId,
		index: 0,
		query: call.query,
		queries: call.queries,
		sources: search.results.map((result) => ({ url: result.url })),
		status: "completed",
	});
}
```

Add `replaceToolIdentities()` to `ResponseStreamStateMachine` in `src/bridge/stream/response-stream-state-machine.ts`:

```ts
replaceToolIdentities(toolIdentities: ToolIdentityMap): void {
	this.toolIdentities = toolIdentities;
}
```

Change `toolIdentities` from `private readonly` to `private` in that class.

- [ ] **Step 5: Allow ProviderExchange stream overrides**

Modify `src/responses/provider-exchange.ts`:

```ts
export interface ProviderExchangeStreamOptions {
	readonly request?: ResponseCreateRequest;
	readonly session?: ResponseSessionSnapshot | null;
}

async stream(
	ctx: ResponsesContext,
	options: ProviderExchangeStreamOptions = {},
): Promise<ProviderStreamExchangeResult> {
	const built = buildProviderRequest(ctx, true, options);
}
```

Update `StreamProviderExchange` in `src/responses/stream-pipeline.ts`:

```ts
stream(
	ctx: ResponsesContext,
	options?: ProviderExchangeStreamOptions,
): Promise<ProviderStreamExchangeResult>;
```

- [ ] **Step 6: Wire stream pipeline**

Modify `src/responses/stream-pipeline.ts` so the raw provider stream bridge is replaced by hosted runner output before existing post-processing transforms:

```ts
import { HostedWebSearchStreamRunner } from "./web-search";

const { stream: eventStream, machine } =
	await new HostedWebSearchStreamRunner(this.exchange).stream(ctx);

const errorSafeStream = wrapWithErrorHandler(
	eventStream,
	machine,
	ctx,
);
```

- [ ] **Step 7: Run stream tests**

Run:

```bash
bun test src/responses/web-search/stream-runner.test.ts src/responses/stream-pipeline.test.ts src/bridge/stream/stream-reconstructor.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit stream hosted loop slice**

Run:

```bash
git add src/responses src/bridge/stream
git commit -m "feat(responses): stream hosted web search events"
```

## Task 6: Provider-Native Zhipu Search Output

**Files:**
- Modify: `src/bridge/provider-spec/contract.ts`
- Modify: `src/bridge/response/response-reconstructor.ts`
- Modify: `src/bridge/stream/response-stream-state-machine.ts`
- Modify: `src/providers/zhipu/hooks.ts`
- Modify: `src/providers/zhipu/spec.ts`
- Modify: `src/providers/zhipu/protocol/completions.ts`
- Add or modify: `src/providers/zhipu/provider.test.ts`
- Add or modify: `src/bridge/response/response-reconstructor.test.ts`

- [ ] **Step 1: Write failing native response reconstruction test**

Add to `src/bridge/response/response-reconstructor.test.ts`:

```ts
test("includes provider-native web_search_call items before assistant message", () => {
	const response = reconstructResponseObject({
		requestId: "req_1",
		responseId: "resp_1",
		createdAt: 1,
		completedAt: 2,
		provider: "zhipu",
		model: "glm-test",
		providerResponse: providerResponse("stop", "Answer from search."),
		accessor: {
			...accessor,
			webSearchCalls: () => [
				{
					id: "ws_resp_1_0",
					type: "web_search_call",
					status: "completed",
					action: {
						type: "search",
						query: "latest bun release",
						queries: ["latest bun release"],
						sources: [{ type: "url", url: "https://example.com/bun" }],
					},
				},
			],
		},
		outputContract: { requiresValidJson: false },
	});

	expect(response.output[0]).toMatchObject({ type: "web_search_call" });
	expect(response.output[1]).toMatchObject({ type: "message" });
});
```

- [ ] **Step 2: Run failing response reconstruction test**

Run:

```bash
bun test src/bridge/response/response-reconstructor.test.ts
```

Expected: FAIL because `webSearchCalls` is not part of the accessor contract.

- [ ] **Step 3: Add optional provider-native output accessor**

Modify `src/bridge/provider-spec/contract.ts`:

```ts
import type { ResponseItem, ResponseUsage } from "../../protocol/openai/responses";

export interface ChatCompletionResponseAccessor<TResponse> {
	firstChoice(response: TResponse): unknown | undefined;
	finishReason(response: TResponse): string | undefined;
	outputText(response: TResponse): string;
	reasoningText?(response: TResponse): string | undefined;
	webSearchCalls?(response: TResponse): ResponseItem[];
	usage(response: TResponse): ResponseUsage | null;
}
```

Modify `src/bridge/response/response-reconstructor.ts`:

```ts
const providerItems = input.accessor.webSearchCalls?.(input.providerResponse) ?? [];
const output: ResponseObject["output"] = [...providerItems];
```

Insert provider-native items before restored tool calls and assistant messages.

- [ ] **Step 4: Implement Zhipu extraction**

Modify `src/providers/zhipu/hooks.ts`:

```ts
import type { ResponseItem } from "../../protocol/openai/responses";

export function zhipuWebSearchCalls(response: ChatCompletionResponse): ResponseItem[] {
	const results = response.web_search ?? [];
	if (results.length === 0) return [];
	return [
		{
			id: `ws_${response.id}_0`,
			type: "web_search_call",
			status: "completed",
			action: {
				type: "search",
				query: firstSearchQuery(results),
					queries: [firstSearchQuery(results)],
					sources: results
					.map((result) => result.link)
					.filter((url): url is string => typeof url === "string" && url.length > 0)
					.map((url) => ({ type: "url", url })),
			},
		},
	];
}
```

Implement `firstSearchQuery()` from existing Zhipu result fields:

```ts
function firstSearchQuery(results: readonly WebSearchResult[]): string {
	return (
		results.find((result) => typeof result.title === "string" && result.title.length > 0)
			?.title ?? "web search"
	);
}
```

Modify `src/providers/zhipu/spec.ts`:

```ts
response: {
	firstChoice: zhipuFirstChoice,
	finishReason: zhipuFinishReason,
	outputText: zhipuOutputText,
	reasoningText: zhipuReasoningText,
	webSearchCalls: zhipuWebSearchCalls,
	usage: zhipuResponseUsage,
},
```

- [ ] **Step 5: Run provider-native tests**

Run:

```bash
bun test src/bridge/response/response-reconstructor.test.ts src/providers/zhipu/provider.test.ts src/providers/provider-conformance.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Zhipu native search slice**

Run:

```bash
git add src/bridge/provider-spec src/bridge/response src/providers/zhipu
git commit -m "feat(zhipu): expose native web search results"
```

## Task 7: Mocked E2E Coverage And Docs

**Files:**
- Modify: `src/e2e/e2e.test.ts`
- Modify: `src/e2e/trace.test.ts`
- Modify: `docs/architecture/responses-bridge-kernel.md`
- Modify: `README.md` only if user-facing feature list needs updating.

- [ ] **Step 1: Add failing E2E tests**

Add mocked E2E cases:

```ts
test("executes managed web search and continues the model for non-native providers", async () => {
	const response = await client.responses.create({
		model: "deepseek/test",
		input: "What is the latest Bun release?",
		tools: [{ type: "web_search", search_context_size: "medium" }],
	});

	expect(response.output.some((item) => item.type === "web_search_call")).toBe(true);
	expect(response.output_text).toContain("mock result");
});

test("streams managed web search lifecycle events before final text", async () => {
	const events = await collectSseEvents(
		client.responses.stream({
			model: "deepseek/test",
			input: "Search for the latest Bun release.",
			tools: [{ type: "web_search" }],
		}),
	);

	expect(events.map((event) => event.type)).toEqual(
		expect.arrayContaining([
			"response.web_search_call.in_progress",
			"response.web_search_call.searching",
			"response.web_search_call.completed",
			"response.output_text.delta",
		]),
	);
});
```

Configure the test app with:

```ts
web_search: {
	enabled: true,
	mode: "godex_managed",
	provider: "mock",
	on_unavailable: "client_tool_call",
	max_iterations: 2,
	timeout_ms: 10000,
},
```

- [ ] **Step 2: Run failing E2E tests**

Run:

```bash
bun run test:e2e
```

Expected: FAIL until mocked upstream fixtures understand the internal `web_search` function declaration and continuation request.

- [ ] **Step 3: Update mock upstream fixtures**

Modify the mock upstream handlers used by `src/e2e/e2e.test.ts`:

```ts
if (hasTool(body, "web_search") && !hasToolOutputMessage(body, "call_search")) {
	return toolCallResponse({
		id: "mock-search-call",
		toolCallId: "call_search",
		name: "web_search",
		arguments: JSON.stringify({ query: "latest Bun release" }),
	});
}
if (hasToolOutputMessage(body, "call_search")) {
	return textResponse("The latest Bun release appears in the mock result.");
}
```

For streaming mocks, emit a function-call delta first, then return text deltas on the continuation stream.

- [ ] **Step 4: Update architecture docs**

Add a web-search rule to `docs/architecture/responses-bridge-kernel.md` near the existing tool planning section:

```md
- Web search uses a hybrid path. Providers with native web search receive provider-native declarations; other providers can receive an internal GodeX-managed function declaration when `web_search.mode` allows hosted execution. If no backend is configured, `on_unavailable` controls whether GodeX returns a client-visible function call, rejects the request, or ignores the tool with diagnostics.
```

- [ ] **Step 5: Run E2E and docs-adjacent tests**

Run:

```bash
bun run test:e2e
bun test src/e2e/trace.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit E2E and docs slice**

Run:

```bash
git add src/e2e docs/architecture README.md
git commit -m "test: cover web search response flows"
```

## Task 8: Final Verification And Cleanup

**Files:**
- Review all modified files from Tasks 1-7.

- [ ] **Step 1: Run unit/integration gate**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 2: Run mocked E2E gate**

Run:

```bash
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 3: Check formatting-sensitive diff**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --short
git diff --stat main...HEAD
```

Expected: only intentional web-search config, bridge, search, response, provider, tests, and docs changes are present.

- [ ] **Step 5: Commit any final cleanup**

If verification required small cleanup changes, commit them:

```bash
git add src/config src/search src/context src/bridge src/responses src/providers src/e2e docs README.md
git commit -m "chore: polish web search support"
```

If no cleanup changes are needed, do not create an empty commit.
