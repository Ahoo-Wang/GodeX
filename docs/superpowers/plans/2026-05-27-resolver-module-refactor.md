# Resolver Module Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/resolver` into focused parser, alias catalog, and orchestration boundaries, then make `/v1/models` consume resolver-owned alias listing.

**Architecture:** Add pure provider/model reference parsing, request selector validation, and alias catalog modules under `src/resolver`. Keep `ModelResolver` as the request-facing facade and make server route code depend on `ModelResolver.listAliases()` instead of parsing alias targets.

**Tech Stack:** TypeScript strict mode, Bun test runner, existing `ServerError` hierarchy, Biome formatting.

---

## File Structure

- Create `src/resolver/model-reference.ts`: pure `provider/model` reference parser and `ResolvedModel` type.
- Create `src/resolver/model-reference.test.ts`: parser boundary tests.
- Create `src/resolver/model-selector.ts`: request selector normalization and request-domain validation.
- Create `src/resolver/model-selector.test.ts`: selector validation tests.
- Create `src/resolver/model-aliases.ts`: exact/wildcard alias lookup and list filtering.
- Create `src/resolver/model-aliases.test.ts`: alias catalog tests.
- Modify `src/resolver/model-resolver.ts`: orchestration-only resolver facade using the new modules.
- Create `src/resolver/model-resolver.test.ts`: resolver contract tests.
- Modify `src/resolver/index.ts`: barrel-export resolver building blocks.
- Modify `src/resolver/index.test.ts`: narrow it to a barrel-export smoke test.
- Modify `src/context/application-services.ts`: construct `ModelResolver` with an options object.
- Modify `src/server/routes/models.ts`: use `app.resolver.listAliases()`.
- Modify `src/server/routes/models.test.ts`: keep route contract coverage and add wildcard omission coverage.

## Task 1: Provider/Model Reference Parser

**Files:**
- Create: `src/resolver/model-reference.test.ts`
- Create: `src/resolver/model-reference.ts`

- [ ] **Step 1: Write the failing parser tests**

Create `src/resolver/model-reference.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseProviderModelReference } from "./model-reference";

describe("parseProviderModelReference", () => {
	test("parses provider and model segments at the first separator", () => {
		expect(parseProviderModelReference("zhipu/glm-5.1")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("allows additional separators inside the model segment", () => {
		expect(parseProviderModelReference("openai/fine_tuned/gpt-4.1")).toEqual({
			provider: "openai",
			model: "fine_tuned/gpt-4.1",
		});
	});

	test("returns undefined when provider or model segment is empty", () => {
		expect(parseProviderModelReference("/glm-5.1")).toBeUndefined();
		expect(parseProviderModelReference("zhipu/")).toBeUndefined();
		expect(parseProviderModelReference("zhipu")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run the parser test to verify RED**

Run:

```bash
bun test src/resolver/model-reference.test.ts
```

Expected: FAIL because `src/resolver/model-reference.ts` does not exist.

- [ ] **Step 3: Implement the parser**

Create `src/resolver/model-reference.ts`:

```ts
export interface ResolvedModel {
	provider: string;
	model: string;
}

export function parseProviderModelReference(
	value: string,
): ResolvedModel | undefined {
	const slashIndex = value.indexOf("/");
	if (slashIndex <= 0 || slashIndex === value.length - 1) {
		return undefined;
	}

	return {
		provider: value.slice(0, slashIndex),
		model: value.slice(slashIndex + 1),
	};
}
```

- [ ] **Step 4: Run the parser test to verify GREEN**

Run:

```bash
bun test src/resolver/model-reference.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolver/model-reference.ts src/resolver/model-reference.test.ts
git commit -m "refactor(resolver): extract model reference parser"
```

## Task 2: Request Model Selector Parser

**Files:**
- Create: `src/resolver/model-selector.test.ts`
- Create: `src/resolver/model-selector.ts`

- [ ] **Step 1: Write the failing selector tests**

Create `src/resolver/model-selector.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { parseModelSelector } from "./model-selector";

function expectServerErrorCode(fn: () => unknown, code: string): void {
	try {
		fn();
		throw new Error(`Expected ServerError ${code}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(code);
	}
}

describe("parseModelSelector", () => {
	test("rejects missing and whitespace-only selectors", () => {
		for (const value of [undefined, null, " "]) {
			expectServerErrorCode(
				() => parseModelSelector(value),
				"server.request.missing_model",
			);
		}
	});

	test("rejects non-string selectors", () => {
		expectServerErrorCode(
			() => parseModelSelector(42),
			"server.request.invalid_parameter",
		);
	});

	test("parses trimmed bare selectors", () => {
		expect(parseModelSelector("  gpt-5  ")).toEqual({
			kind: "bare",
			selector: "gpt-5",
			model: "gpt-5",
		});
	});

	test("parses provider-qualified selectors", () => {
		expect(parseModelSelector(" zhipu/glm-5.1 ")).toEqual({
			kind: "provider_model",
			selector: "zhipu/glm-5.1",
			resolved: { provider: "zhipu", model: "glm-5.1" },
		});
	});

	test("allows extra separators inside provider-qualified model segment", () => {
		expect(parseModelSelector("openai/fine_tuned/gpt-4.1")).toEqual({
			kind: "provider_model",
			selector: "openai/fine_tuned/gpt-4.1",
			resolved: { provider: "openai", model: "fine_tuned/gpt-4.1" },
		});
	});

	test("rejects provider-qualified selectors with empty segments", () => {
		for (const value of ["/glm-5.1", "zhipu/"]) {
			expectServerErrorCode(
				() => parseModelSelector(value),
				"server.request.invalid_parameter",
			);
		}
	});
});
```

- [ ] **Step 2: Run the selector test to verify RED**

Run:

```bash
bun test src/resolver/model-selector.test.ts
```

Expected: FAIL because `src/resolver/model-selector.ts` does not exist.

- [ ] **Step 3: Implement selector parsing**

Create `src/resolver/model-selector.ts`:

```ts
import {
	SERVER_REQUEST_INVALID_PARAMETER,
	SERVER_REQUEST_MISSING_MODEL,
	ServerError,
} from "../error";
import {
	parseProviderModelReference,
	type ResolvedModel,
} from "./model-reference";

export type ModelSelector =
	| {
			kind: "provider_model";
			selector: string;
			resolved: ResolvedModel;
	  }
	| {
			kind: "bare";
			selector: string;
			model: string;
	  };

export function parseModelSelector(model: unknown): ModelSelector {
	if (model === undefined || model === null) {
		throw new ServerError(
			SERVER_REQUEST_MISSING_MODEL,
			"Missing required field: model",
			{ parameter: "model" },
		);
	}

	if (typeof model !== "string") {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			"model must be a string",
			{ parameter: "model" },
		);
	}

	const selector = model.trim();
	if (!selector) {
		throw new ServerError(
			SERVER_REQUEST_MISSING_MODEL,
			"Missing required field: model",
			{ parameter: "model" },
		);
	}

	if (!selector.includes("/")) {
		return { kind: "bare", selector, model: selector };
	}

	const resolved = parseProviderModelReference(selector);
	if (!resolved) {
		throw new ServerError(
			SERVER_REQUEST_INVALID_PARAMETER,
			"Invalid model selector: provider and model segments must be non-empty",
			{ model, parameter: "model" },
		);
	}

	return { kind: "provider_model", selector, resolved };
}
```

- [ ] **Step 4: Run the selector and parser tests to verify GREEN**

Run:

```bash
bun test src/resolver/model-reference.test.ts src/resolver/model-selector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolver/model-selector.ts src/resolver/model-selector.test.ts
git commit -m "refactor(resolver): extract model selector parsing"
```

## Task 3: Model Alias Catalog

**Files:**
- Create: `src/resolver/model-aliases.test.ts`
- Create: `src/resolver/model-aliases.ts`

- [ ] **Step 1: Write the failing alias catalog tests**

Create `src/resolver/model-aliases.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ModelAliasCatalog } from "./model-aliases";

describe("ModelAliasCatalog", () => {
	test("resolves exact aliases before wildcard aliases", () => {
		const aliases = new ModelAliasCatalog({
			"*": "zhipu/glm-5.1",
			"gpt-5": "openai/gpt-5",
		});

		expect(aliases.resolveBareModel("gpt-5")).toEqual({
			provider: "openai",
			model: "gpt-5",
		});
	});

	test("resolves wildcard aliases for unmatched bare selectors", () => {
		const aliases = new ModelAliasCatalog({ "*": "zhipu/glm-5.1" });

		expect(aliases.resolveBareModel("anything")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("ignores invalid targets defensively", () => {
		const aliases = new ModelAliasCatalog({
			"gpt-5": "invalid-target",
			"*": "/missing-provider",
		});

		expect(aliases.resolveBareModel("gpt-5")).toBeUndefined();
		expect(aliases.resolveBareModel("unknown")).toBeUndefined();
		expect(aliases.list()).toEqual([]);
	});

	test("lists only non-wildcard aliases", () => {
		const aliases = new ModelAliasCatalog({
			"*": "zhipu/glm-5.1",
			"gpt-5": "zhipu/glm-5.1",
			"gpt-4o": "openai/gpt-4o",
		});

		expect(aliases.list()).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
			{ alias: "gpt-4o", target: { provider: "openai", model: "gpt-4o" } },
		]);
	});

	test("filters listed aliases by registered providers", () => {
		const aliases = new ModelAliasCatalog({
			"gpt-5": "zhipu/glm-5.1",
			"gpt-4o": "openai/gpt-4o",
		});

		expect(aliases.list(["zhipu"])).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
		]);
	});
});
```

- [ ] **Step 2: Run the alias catalog test to verify RED**

Run:

```bash
bun test src/resolver/model-aliases.test.ts
```

Expected: FAIL because `src/resolver/model-aliases.ts` does not exist.

- [ ] **Step 3: Implement the alias catalog**

Create `src/resolver/model-aliases.ts`:

```ts
import {
	parseProviderModelReference,
	type ResolvedModel,
} from "./model-reference";

const WILDCARD_ALIAS = "*";

export interface ModelAliasEntry {
	alias: string;
	target: ResolvedModel;
}

export class ModelAliasCatalog {
	private readonly aliases: Record<string, string>;

	constructor(aliases?: Record<string, string>) {
		this.aliases = aliases ?? {};
	}

	resolveBareModel(model: string): ResolvedModel | undefined {
		return this.parseTarget(this.aliases[model]) ?? this.parseWildcardTarget();
	}

	list(registeredProviders?: Iterable<string>): ModelAliasEntry[] {
		const providerFilter = registeredProviders
			? new Set(registeredProviders)
			: undefined;
		const entries: ModelAliasEntry[] = [];

		for (const [alias, target] of Object.entries(this.aliases)) {
			if (alias === WILDCARD_ALIAS) continue;
			const resolved = this.parseTarget(target);
			if (!resolved) continue;
			if (providerFilter && !providerFilter.has(resolved.provider)) continue;
			entries.push({ alias, target: resolved });
		}

		return entries;
	}

	private parseWildcardTarget(): ResolvedModel | undefined {
		return this.parseTarget(this.aliases[WILDCARD_ALIAS]);
	}

	private parseTarget(target: string | undefined): ResolvedModel | undefined {
		if (!target) return undefined;
		return parseProviderModelReference(target);
	}
}
```

- [ ] **Step 4: Run resolver component tests to verify GREEN**

Run:

```bash
bun test src/resolver/model-reference.test.ts src/resolver/model-selector.test.ts src/resolver/model-aliases.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/resolver/model-aliases.ts src/resolver/model-aliases.test.ts
git commit -m "refactor(resolver): extract model alias catalog"
```

## Task 4: Resolver Facade Orchestration

**Files:**
- Create: `src/resolver/model-resolver.test.ts`
- Modify: `src/resolver/index.ts`
- Modify: `src/resolver/model-resolver.ts`
- Modify: `src/resolver/index.test.ts`

- [ ] **Step 1: Write the failing resolver facade tests**

Create `src/resolver/model-resolver.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { ServerError } from "../error";
import { ModelResolver } from "./model-resolver";

function expectServerErrorCode(fn: () => unknown, code: string): void {
	try {
		fn();
		throw new Error(`Expected ServerError ${code}`);
	} catch (err) {
		expect(err).toBeInstanceOf(ServerError);
		expect((err as ServerError).code).toBe(code);
	}
}

describe("ModelResolver", () => {
	const resolver = new ModelResolver({
		defaultProvider: "zhipu",
		aliases: {
			"gpt-5": "zhipu/glm-5.1",
			"gpt-4o": "zhipu/glm-4.7",
			"*": "zhipu/glm-5.1",
		},
	});

	test("resolves exact bare aliases", () => {
		expect(resolver.resolve("gpt-5")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("resolves wildcard aliases for unmatched bare selectors", () => {
		expect(resolver.resolve("gpt-5.5")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("falls back bare selectors to default provider without aliases", () => {
		const noAliases = new ModelResolver({ defaultProvider: "openai" });

		expect(noAliases.resolve("gpt-4o")).toEqual({
			provider: "openai",
			model: "gpt-4o",
		});
	});

	test("returns provider-qualified selectors without alias lookup", () => {
		expect(resolver.resolve("deepseek/deepseek-chat")).toEqual({
			provider: "deepseek",
			model: "deepseek-chat",
		});
	});

	test("lists resolver-owned aliases", () => {
		expect(resolver.listAliases(["zhipu"])).toEqual([
			{ alias: "gpt-5", target: { provider: "zhipu", model: "glm-5.1" } },
			{ alias: "gpt-4o", target: { provider: "zhipu", model: "glm-4.7" } },
		]);
	});

	test("rejects missing model selectors", () => {
		for (const model of [undefined, null, " "]) {
			expectServerErrorCode(
				() => resolver.resolve(model),
				"server.request.missing_model",
			);
		}
	});

	test("rejects invalid model selectors", () => {
		for (const model of ["/glm-5.1", "zhipu/", 42]) {
			expectServerErrorCode(
				() => resolver.resolve(model),
				"server.request.invalid_parameter",
			);
		}
	});
});
```

Replace `src/resolver/index.test.ts` with:

```ts
import { describe, expect, test } from "bun:test";
import {
	ModelAliasCatalog,
	ModelResolver,
	parseModelSelector,
	parseProviderModelReference,
} from ".";

describe("resolver barrel exports", () => {
	test("exports resolver building blocks", () => {
		expect(ModelResolver).toBeFunction();
		expect(ModelAliasCatalog).toBeFunction();
		expect(parseModelSelector).toBeFunction();
		expect(parseProviderModelReference).toBeFunction();
	});
});
```

- [ ] **Step 2: Run resolver facade tests to verify RED**

Run:

```bash
bun test src/resolver
```

Expected: FAIL because `ModelResolver` still uses the old positional constructor and does not expose `listAliases()`.

- [ ] **Step 3: Refactor `ModelResolver` into orchestration**

Replace `src/resolver/model-resolver.ts` with:

```ts
import {
	ModelAliasCatalog,
	type ModelAliasEntry,
} from "./model-aliases";
import type { ResolvedModel } from "./model-reference";
import { parseModelSelector } from "./model-selector";

export interface ModelResolverOptions {
	defaultProvider: string;
	aliases?: Record<string, string>;
}

export class ModelResolver {
	private readonly defaultProvider: string;
	private readonly aliases: ModelAliasCatalog;

	constructor(options: ModelResolverOptions) {
		this.defaultProvider = options.defaultProvider;
		this.aliases = new ModelAliasCatalog(options.aliases);
	}

	resolve(model: unknown): ResolvedModel {
		const selector = parseModelSelector(model);

		if (selector.kind === "provider_model") {
			return selector.resolved;
		}

		return (
			this.aliases.resolveBareModel(selector.model) ?? {
				provider: this.defaultProvider,
				model: selector.model,
			}
		);
	}

	listAliases(registeredProviders?: Iterable<string>): ModelAliasEntry[] {
		return this.aliases.list(registeredProviders);
	}
}
```

Replace `src/resolver/index.ts` with:

```ts
export * from "./model-aliases";
export * from "./model-reference";
export * from "./model-resolver";
export * from "./model-selector";
```

- [ ] **Step 4: Run resolver tests to verify GREEN**

Run:

```bash
bun test src/resolver
```

Expected: PASS for resolver tests.

- [ ] **Step 5: Commit**

```bash
git add src/resolver/index.ts src/resolver/index.test.ts src/resolver/model-resolver.ts src/resolver/model-resolver.test.ts
git commit -m "refactor(resolver): compose resolver facade"
```

## Task 5: Application and Models Route Integration

**Files:**
- Modify: `src/context/application-services.ts`
- Modify: `src/server/routes/models.ts`
- Modify: `src/server/routes/models.test.ts`

- [ ] **Step 1: Write the failing route contract test**

Update the config in `src/server/routes/models.test.ts` so it includes a wildcard alias:

```ts
models: {
	aliases: {
		"*": "zhipu/glm-4",
		"gpt-5": "zhipu/glm-5.1",
	},
},
```

Update the first test body assertion so wildcard aliases are omitted:

```ts
expect(body.object).toBe("list");
expect(body.data).toEqual([
	{ id: "gpt-5", object: "model", owned_by: "zhipu" },
]);
expect(body.data.some((model) => model.id === "*")).toBe(false);
```

- [ ] **Step 2: Run integration tests to verify RED**

Run:

```bash
bun test src/server/routes/models.test.ts src/context/application-services.test.ts
```

Expected: FAIL because `createApplicationServices()` still calls the old `ModelResolver` constructor.

- [ ] **Step 3: Update application service resolver construction**

In `src/context/application-services.ts`, replace:

```ts
const resolver = new ModelResolver(
	config.default_provider,
	config.models?.aliases,
);
```

with:

```ts
const resolver = new ModelResolver({
	defaultProvider: config.default_provider,
	aliases: config.models?.aliases,
});
```

- [ ] **Step 4: Move `/v1/models` listing to resolver-owned aliases**

Replace `src/server/routes/models.ts` with:

```ts
import type { ApplicationContext } from "../../context/application-context";

interface ModelListItem {
	id: string;
	object: "model";
	owned_by: string;
}

export function handleModels(app: ApplicationContext): Response {
	const data: ModelListItem[] = app.resolver
		.listAliases(app.registrar.list())
		.map((entry) => ({
			id: entry.alias,
			object: "model",
			owned_by: entry.target.provider,
		}));

	return Response.json({ object: "list", data });
}
```

- [ ] **Step 5: Run integration tests to verify GREEN**

Run:

```bash
bun test src/server/routes/models.test.ts src/context/application-services.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run request context tests that depend on resolver construction**

Run:

```bash
bun test src/context/responses-context-factory.test.ts src/server/routes/responses/handler.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/context/application-services.ts src/server/routes/models.ts src/server/routes/models.test.ts
git commit -m "refactor(resolver): use resolver aliases for model listing"
```

## Task 6: Full Verification

**Files:**
- Verify: repository state

- [ ] **Step 1: Run resolver and route focused tests**

Run:

```bash
bun test src/resolver src/server/routes/models.test.ts src/context/application-services.test.ts src/context/responses-context-factory.test.ts src/server/routes/responses/handler.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full project check**

Run:

```bash
bun run check
```

Expected: PASS for typecheck, lint, and tests.

- [ ] **Step 3: Run whitespace check**

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

Expected: only resolver, route, application service, test, and plan/spec changes are present.

- [ ] **Step 5: Commit verification-only updates if any were made**

If verification required a code or test adjustment inside the planned scope, commit it with:

```bash
git add src/resolver src/context/application-services.ts src/server/routes/models.ts src/server/routes/models.test.ts
git commit -m "test(resolver): cover resolver module integration"
```

If no files changed during verification, do not create an empty commit.

## Self-Review Checklist

- Spec coverage: Tasks 1-4 cover parser, selector, alias catalog, and resolver facade boundaries. Task 5 covers application service construction and `/v1/models` route integration. Task 6 covers full verification.
- Type consistency: `ResolvedModel` is defined in `model-reference.ts` and re-exported through `index.ts`. `ModelAliasEntry` is defined in `model-aliases.ts` and returned by `ModelResolver.listAliases()`.
- Scope check: The plan does not change config schema, provider registration policy, or `createResponsesContext()` provider checks.
