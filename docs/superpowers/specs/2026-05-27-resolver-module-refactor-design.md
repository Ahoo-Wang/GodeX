# Resolver Module Refactor Design

## Goal

Refactor `src/resolver` so model selector parsing, alias resolution, and model listing are explicit, focused responsibilities.

This is an internal architecture cleanup. The external request behavior should stay stable, but internal constructor shapes and helper APIs do not need compatibility shims. The desired result is a resolver module that owns model naming rules once, while `src/context` and `src/server` consume clear resolver capabilities instead of duplicating string parsing.

## Current State

`src/resolver` currently contains a very small public surface:

- `index.ts`
- `model-resolver.ts`
- `index.test.ts`

`ModelResolver` currently does all of the following in one class:

- validate that `request.model` exists
- reject non-string model selectors
- trim selector whitespace
- split provider-qualified selectors like `zhipu/glm-5.1`
- expand exact model aliases
- expand wildcard aliases
- fall back bare selectors to `default_provider`
- construct request-domain `ServerError` instances

The behavior is still manageable, but several responsibilities are hidden inside one method. The coupling is visible outside the resolver too: `src/server/routes/models.ts` repeats alias target parsing so `/v1/models` can list configured aliases.

That means the format `provider/model` is understood in at least two places. The route should not need to know that alias targets are slash-delimited; it should ask the resolver for listable aliases.

## Approaches Considered

### 1. Small Method Extraction

Keep the current single-file shape and extract private helper methods inside `model-resolver.ts`.

This is low overhead, but it does not create useful test boundaries. The server route would still either duplicate parsing or reach into private details.

### 2. Focused Resolver Components

Split the resolver module into small files that each own one rule set:

- model selector parsing
- provider/model reference splitting
- alias catalog lookup and listing
- resolver orchestration

`ModelResolver` remains the public entry point for request-time resolution. It also exposes a resolver-owned alias listing method for `/v1/models`.

This keeps the module compact while removing duplicated parsing from the server layer.

### 3. Move Model Aliases Into Config Objects

Normalize `models.aliases` during config parsing into structured objects instead of `Record<string, string>`, then have the resolver consume the structured config.

This would make alias data cleaner at the source, but it changes the config schema surface and pushes resolver-specific concepts into `src/config`. The config module currently owns validation messages and raw file parsing; changing that module is a broader refactor than this branch needs.

## Selected Design

Use approach 2.

The refactored module should look like this:

```text
src/resolver/
+-- index.test.ts
+-- index.ts
+-- model-aliases.test.ts
+-- model-aliases.ts
+-- model-reference.test.ts
+-- model-reference.ts
+-- model-resolver.test.ts
+-- model-resolver.ts
+-- model-selector.test.ts
+-- model-selector.ts
```

`index.test.ts` can either be removed or narrowed to barrel-export behavior if the new focused tests cover the resolver contract directly. Keeping stale broad tests only to preserve the old file name is not required.

### `model-reference.ts`

Owns provider/model splitting.

```ts
export interface ResolvedModel {
	provider: string;
	model: string;
}

export function parseProviderModelReference(value: string): ResolvedModel | undefined;
```

Rules:

- the first slash separates provider from model
- provider must be non-empty
- model must be non-empty
- model may contain additional slashes after the first separator
- the parser is pure and does not create HTTP/request errors

This file is deliberately small because both request selectors and alias targets need the same split semantics.

### `model-selector.ts`

Owns request selector normalization and request-domain validation.

```ts
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

export function parseModelSelector(model: unknown): ModelSelector;
```

Rules:

- `undefined`, `null`, and whitespace-only selectors throw `SERVER_REQUEST_MISSING_MODEL`
- non-string selectors throw `SERVER_REQUEST_INVALID_PARAMETER`
- selectors are trimmed before resolution
- provider-qualified selectors must have non-empty provider and model segments
- bare selectors are returned without applying aliases or default provider

This keeps request validation independent from alias policy.

### `model-aliases.ts`

Owns alias lookup and alias listing.

```ts
export interface ModelAliasEntry {
	alias: string;
	target: ResolvedModel;
}

export class ModelAliasCatalog {
	constructor(aliases?: Record<string, string>);

	resolveBareModel(model: string): ResolvedModel | undefined;

	list(registeredProviders?: Iterable<string>): ModelAliasEntry[];
}
```

Rules:

- exact aliases win over wildcard aliases
- wildcard alias key is `*`
- wildcard aliases are used for request resolution but are not listed by `/v1/models`
- invalid alias targets are ignored by the catalog rather than throwing at request time
- when `registeredProviders` is supplied, `list()` only returns aliases whose target provider is registered

Config parsing already validates alias targets and configured providers. The catalog should still be defensive because tests and custom callers can instantiate `ModelResolver` directly.

### `model-resolver.ts`

Owns orchestration only.

```ts
export interface ModelResolverOptions {
	defaultProvider: string;
	aliases?: Record<string, string>;
}

export class ModelResolver {
	constructor(options: ModelResolverOptions);

	resolve(model: unknown): ResolvedModel;

	listAliases(registeredProviders?: Iterable<string>): ModelAliasEntry[];
}
```

Resolution order:

1. parse the request selector with `parseModelSelector()`
2. return provider-qualified selectors directly
3. resolve bare selectors through exact aliases
4. resolve bare selectors through wildcard alias
5. fall back to `{ provider: defaultProvider, model: selector }`

`ModelResolver` should not know about `ApplicationContext`, provider factories, HTTP responses, or `/v1/models` response shapes.

### `src/context/application-services.ts`

Application service assembly should construct the resolver with an explicit options object:

```ts
const resolver = new ModelResolver({
	defaultProvider: config.default_provider,
	aliases: config.models?.aliases,
});
```

This makes constructor arguments self-describing and avoids positional drift if resolver options grow later.

### `src/server/routes/models.ts`

The route should stop parsing `models.aliases` directly.

It should ask the resolver for listable aliases:

```ts
const registeredProviders = app.registrar.list();
const data = app.resolver.listAliases(registeredProviders).map((entry) => ({
	id: entry.alias,
	object: "model" as const,
	owned_by: entry.target.provider,
}));
```

The route remains responsible only for HTTP response shaping.

## Behavior

Request-time behavior must remain stable:

- exact aliases continue to resolve before wildcard aliases
- wildcard aliases continue to resolve unmatched bare selectors
- bare selectors without aliases continue to use `default_provider`
- explicit `provider/model` selectors continue to bypass alias lookup
- invalid selectors continue to produce `ServerError` with the same domain codes
- provider existence and provider registration checks remain in `createResponsesContext()`

`/v1/models` behavior must remain stable:

- non-wildcard aliases are listed
- aliases targeting unregistered providers are omitted
- wildcard aliases are not listed
- response items still use `{ id, object: "model", owned_by }`

## Testing

Add focused tests around the new boundaries:

- `model-reference.test.ts`
  - parses valid `provider/model` references
  - allows additional slashes in the model segment
  - returns `undefined` for missing provider or model segments
- `model-selector.test.ts`
  - rejects missing, whitespace-only, and non-string selectors with the existing server error codes
  - parses bare selectors
  - parses provider-qualified selectors
  - trims selector whitespace
- `model-aliases.test.ts`
  - resolves exact aliases before wildcard aliases
  - resolves wildcard aliases for unmatched bare selectors
  - ignores invalid targets defensively
  - lists only non-wildcard aliases
  - filters listed aliases by registered providers
- `model-resolver.test.ts`
  - preserves the full request resolution contract
  - verifies provider-qualified selectors bypass aliases
  - verifies bare fallback to `defaultProvider`
- `server/routes/models.test.ts`
  - remains a route contract test and no longer relies on duplicated parsing in the route

Use Bun's built-in test runner. Every production change should be preceded by a failing focused test.

## Out Of Scope

- Changing `godex.yaml` schema
- Changing `ModelsConfig` from `Record<string, string>` to structured objects
- Adding provider-discovered model catalogs
- Changing model alias configuration validation messages
- Moving provider existence checks out of `createResponsesContext()`
- Adding compatibility forwarding constructors for the old positional `ModelResolver` shape

## Rollout

This is a single-branch internal refactor.

Implementation should be staged in small commits:

1. add parser and alias-catalog tests
2. implement parser and catalog modules
3. refactor `ModelResolver` orchestration and tests
4. move `/v1/models` to resolver-owned listing
5. run `bun run check` and `git diff --check`

No data migration or runtime rollout step is required.
