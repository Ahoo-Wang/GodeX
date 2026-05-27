# Providers Runtime Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor provider runtime wiring so bundle composition, provider definitions, and registrar registration state have explicit responsibilities.

**Architecture:** Add a neutral provider bundle helper under `src/providers/`, make provider-specific factories return neutral bundles, add provider definitions for built-in catalog wiring, and tighten registrar registration results. Tests drive the new public runtime behavior before production code changes.

**Tech Stack:** TypeScript strict mode, Bun test runner, Biome, existing `Provider` and `ProviderConfig` contracts.

---

## File Structure

- Create `src/providers/provider-bundle.ts`: provider-agnostic `createProviderBundle()` helper.
- Create `src/providers/provider-bundle.test.ts`: focused bundle identity and contract tests.
- Create `src/providers/definition.ts`: `ProviderDefinition` type and definition helpers.
- Create `src/providers/definition.test.ts`: built-in definition uniqueness and factory contract tests.
- Modify `src/providers/builtin.ts`: declarative `BUILTIN_PROVIDER_DEFINITIONS` catalog.
- Modify `src/providers/builtin.test.ts`: assert all built-in definitions configure and resolve.
- Modify `src/providers/registrar.ts`: `ProviderRegistrationResult`, definition registration, replacement semantics.
- Modify `src/providers/registrar.test.ts`: registration result and stale provider replacement tests.
- Modify `src/providers/openai/provider.ts`: keep only OpenAI-specific constants and optional class facade if it remains useful.
- Modify `src/providers/openai/factory.ts`: compose mapper and client through `createProviderBundle()`.
- Modify `src/providers/zhipu/provider.ts`: remove inheritance from `OpenAIProvider`, keep provider constants and optional class facade.
- Modify `src/providers/zhipu/factory.ts`: compose through neutral bundle and default base URL.
- Modify `src/providers/deepseek/provider.ts`: remove inheritance from `OpenAIProvider`, keep provider constants and optional class facade.
- Modify `src/providers/deepseek/factory.ts`: compose through neutral bundle.
- Modify `src/providers/provider-conformance.test.ts`: add runtime provider definition conformance.
- Modify `src/providers/index.ts` and provider barrels as needed for exports.

## Task 1: Provider Bundle

**Files:**
- Create: `src/providers/provider-bundle.test.ts`
- Create: `src/providers/provider-bundle.ts`
- Modify: `src/providers/index.ts`

- [ ] **Step 1: Write the failing bundle test**

```ts
import { describe, expect, test } from "bun:test";
import type { ProviderClient, ProviderMapper } from "../adapter/provider";
import { createProviderBundle } from "./provider-bundle";

describe("createProviderBundle", () => {
	test("creates a provider and preserves mapper and client identity", () => {
		const mapper: ProviderMapper<{ prompt: string }, { text: string }, { delta: string }> = {
			request: { map: () => ({ prompt: "hello" }) },
			response: { map: () => ({}) as never },
			stream: { map: () => [] },
		};
		const client: ProviderClient<{ prompt: string }, { text: string }, { delta: string }> = {
			request: async () => ({ text: "hello" }),
			stream: async () => new ReadableStream(),
		};

		const provider = createProviderBundle({
			name: "test-provider",
			mapper,
			client,
		});

		expect(provider.name).toBe("test-provider");
		expect(provider.mapper).toBe(mapper);
		expect(provider.client).toBe(client);
	});
});
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/providers/provider-bundle.test.ts`

Expected: fail because `src/providers/provider-bundle.ts` does not exist.

- [ ] **Step 3: Implement the helper**

```ts
import type { Provider, ProviderClient, ProviderMapper } from "../adapter/provider";

export interface ProviderBundleParts<TReq, TRes, TChunk> {
	readonly name: string;
	readonly mapper: ProviderMapper<TReq, TRes, TChunk>;
	readonly client: ProviderClient<TReq, TRes, TChunk>;
}

export function createProviderBundle<TReq, TRes, TChunk>(
	parts: ProviderBundleParts<TReq, TRes, TChunk>,
): Provider<TReq, TRes, TChunk> {
	return {
		name: parts.name,
		mapper: parts.mapper,
		client: parts.client,
	};
}
```

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/providers/provider-bundle.test.ts`

Expected: pass.

## Task 2: Provider-Specific Factory Composition

**Files:**
- Create: `src/providers/provider-factory.test.ts`
- Delete: `src/providers/openai/provider.test.ts`
- Modify: `src/providers/openai/provider.ts`
- Modify: `src/providers/openai/factory.ts`
- Modify: `src/providers/zhipu/provider.ts`
- Modify: `src/providers/zhipu/factory.ts`
- Modify: `src/providers/deepseek/provider.test.ts`
- Modify: `src/providers/deepseek/provider.ts`
- Modify: `src/providers/deepseek/factory.ts`
- Modify: `src/e2e/e2e.test.ts`
- Modify: `src/e2e/trace.test.ts`
- Modify: `src/e2e/zhipu-live.test.ts`
- Modify: `src/e2e/deepseek-live.test.ts`

- [ ] **Step 1: Replace inheritance tests with provider contract tests**

Create `src/providers/provider-factory.test.ts` so it imports provider factories and asserts neutral bundle behavior. Update `src/providers/deepseek/provider.test.ts` so it asserts factory-created providers expose the correct name, mapper methods, and client methods.

- [ ] **Step 2: Verify RED**

Run: `bun test src/providers/provider-factory.test.ts src/providers/deepseek/provider.test.ts`

Expected: fail until provider classes stop being the asserted runtime abstraction or tests import the new helper.

- [ ] **Step 3: Compose factories through the neutral helper**

Each provider factory should create mapper and client locally and return:

```ts
return createProviderBundle({
	name: PROVIDER_NAME,
	mapper,
	client: new ProviderClient(baseURL, config.api_key, options.timeout),
});
```

Provider classes can be removed from production paths. `ProviderConfig` currently contains only `api_key` and `base_url`; call-site-only timeout needs should use factory creation options rather than adding timeout to the config schema.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/providers/provider-factory.test.ts src/providers/deepseek/provider.test.ts src/e2e/e2e.test.ts src/e2e/trace.test.ts --path-ignore-patterns 'src/e2e/*live.test.ts'`

Expected: pass.

## Task 3: Provider Definitions And Built-In Catalog

**Files:**
- Create: `src/providers/definition.ts`
- Create: `src/providers/definition.test.ts`
- Modify: `src/providers/builtin.ts`
- Modify: `src/providers/builtin.test.ts`
- Modify: `src/providers/provider-conformance.test.ts`
- Modify: `src/providers/index.ts`

- [ ] **Step 1: Write failing definition tests**

Add tests that import `BUILTIN_PROVIDER_DEFINITIONS`, assert unique names, assert each `create()` returns a provider whose `name` matches the definition name, and assert request/response/stream mapper methods plus request/stream client functions exist.

- [ ] **Step 2: Verify RED**

Run: `bun test src/providers/definition.test.ts src/providers/builtin.test.ts src/providers/provider-conformance.test.ts`

Expected: fail because `definition.ts` and `BUILTIN_PROVIDER_DEFINITIONS` do not exist yet.

- [ ] **Step 3: Implement definitions**

```ts
import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";

export interface ProviderDefinition {
	readonly name: string;
	create(config: ProviderConfig): Provider<unknown, unknown, unknown>;
}
```

`builtin.ts` should export `BUILTIN_PROVIDER_DEFINITIONS` with OpenAI, Zhipu, and DeepSeek definition entries.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/providers/definition.test.ts src/providers/builtin.test.ts src/providers/provider-conformance.test.ts`

Expected: pass.

## Task 4: Registrar Registration Result And Replacement Semantics

**Files:**
- Modify: `src/providers/registrar.test.ts`
- Modify: `src/providers/registrar.ts`
- Modify: `src/context/provider-bootstrap.test.ts`
- Modify: `src/context/provider-bootstrap.ts` only if the return value needs to be consumed.

- [ ] **Step 1: Write failing registrar tests**

Add tests for:

```ts
const result = registrar.registerProviders({
	zhipu: { api_key: "test", base_url: "http://test" },
	unsupported: { api_key: "test", base_url: "http://unsupported" },
});

expect(result).toEqual({
	registered: ["zhipu"],
	unsupported: ["unsupported"],
});
```

And:

```ts
registrar.registerProviders({ zhipu: { api_key: "test", base_url: "http://test" } });
registrar.registerProviders({ openai: { api_key: "test", base_url: "http://openai" } });

expect(registrar.list()).toEqual(["openai"]);
expect(() => registrar.resolve("zhipu")).toThrow("Provider not registered: zhipu");
```

- [ ] **Step 2: Verify RED**

Run: `bun test src/providers/registrar.test.ts src/context/provider-bootstrap.test.ts`

Expected: fail because `registerProviders()` currently returns `void` and retains stale provider instances.

- [ ] **Step 3: Implement registrar behavior**

Add:

```ts
export interface ProviderRegistrationResult {
	registered: string[];
	unsupported: string[];
}
```

`registerProviders()` should build a fresh provider map, assign it after processing the configuration snapshot, update `unsupportedProviders`, log the fresh result, and return `{ registered, unsupported }`.

- [ ] **Step 4: Verify GREEN**

Run: `bun test src/providers/registrar.test.ts src/context/provider-bootstrap.test.ts`

Expected: pass.

## Task 5: Full Verification And Commit

**Files:**
- All files changed by Tasks 1-4.

- [ ] **Step 1: Run focused providers tests**

Run: `bun test src/providers`

Expected: pass.

- [ ] **Step 2: Run repository gate**

Run: `bun run check`

Expected: typecheck, lint, and non-e2e tests pass.

- [ ] **Step 3: Check whitespace**

Run: `git diff --check`

Expected: no output.

- [ ] **Step 4: Commit**

Run:

```bash
git add -f docs/superpowers/plans/2026-05-27-providers-runtime-refactor.md
git add src/providers src/context src/e2e
git commit -m "refactor(providers): split runtime wiring"
```

Expected: commit succeeds on `refactor/providers-runtime`.
