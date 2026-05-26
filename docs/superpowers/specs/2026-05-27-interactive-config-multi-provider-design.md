# Interactive Multi-Provider Config Design

## Goal

Refactor `godex init` so new users can configure one or more built-in providers in a clear wizard instead of the current Zhipu-only flow. The generated `godex.yaml` must remain compatible with the existing `GodeXConfig` schema and `config check` behaviour.

## Current State

`src/cli/init.ts` owns the whole wizard and YAML rendering. It asks for one provider, but the only option is Zhipu. It imports Zhipu base URL constants directly and hard-codes the Zhipu API-key placeholder and base URL choices.

The runtime already supports multiple providers through:

- `providers: Record<string, ProviderConfig>`
- `default_provider`
- built-in providers `openai`, `zhipu`, and `deepseek`

The mismatch is purely in the interactive configuration experience.

## Approaches Considered

### 1. Minimal Patch

Add OpenAI and DeepSeek options directly to `init.ts`, then branch inside the existing flow.

This is fastest, but it would make `init.ts` grow into a provider-policy file. Every provider added later would require editing the same wizard logic, and tests would keep asserting implementation details rather than provider metadata.

### 2. Provider Catalog With Multi-Provider Wizard

Create a small CLI-side provider catalog that describes each configurable provider: id, label, API key env placeholder, base URL choices, and default base URL. The wizard uses this catalog to let users choose multiple providers, configure each provider in sequence, then choose the default provider from the configured set.

This keeps provider-specific UI policy in one data structure and leaves `init.ts` responsible for orchestration. It also matches the existing config schema without any runtime schema change.

### 3. Full Profile System

Introduce named presets such as "DeepSeek only", "Zhipu coding plan", "OpenAI compatible", and "All providers", each with different aliases and defaults.

This may be useful later, but it creates another concept users need to learn. It is more product surface than the current goal requires.

## Selected Design

Use approach 2: a provider catalog plus a multi-provider wizard.

The wizard flow will be:

1. Intro.
2. Ask which providers to configure with a multi-select.
3. For each selected provider:
   - ask API key or env placeholder, defaulting to the provider's recommended env placeholder
   - ask base URL from provider-specific choices
4. Ask the default provider from the selected providers.
5. Ask server port.
6. Ask session backend.
7. Ask log level.
8. Render `godex.yaml`.

If the user selects no providers or cancels any prompt, the wizard exits without writing a file.

## Provider Catalog

Add `src/cli/init-providers.ts` with provider metadata:

```ts
export interface InitProviderDefinition {
	id: "openai" | "zhipu" | "deepseek";
	label: string;
	apiKeyPlaceholder: string;
	baseUrlChoices: InitProviderBaseUrlChoice[];
	defaultBaseUrl: string;
}
```

Initial definitions:

- `zhipu`
  - label: `Zhipu (智谱)`
  - API key placeholder: `${ZHIPU_API_KEY}`
  - base URLs: Coding Plan recommended, Standard
  - default: Coding Plan
- `deepseek`
  - label: `DeepSeek`
  - API key placeholder: `${DEEPSEEK_API_KEY}`
  - base URL: Standard `https://api.deepseek.com`
  - default: Standard
- `openai`
  - label: `OpenAI`
  - API key placeholder: `${OPENAI_API_KEY}`
  - base URL: Standard `https://api.openai.com/v1`
  - default: Standard

The catalog imports provider constants from provider modules, but provider modules do not import CLI code.

## YAML Rendering

Replace the current single-provider `buildConfigYaml` input with a richer shape:

```ts
interface InitConfigYamlOptions {
	defaultProvider: string;
	providers: InitProviderConfig[];
	port: string;
	sessionBackend: string;
	logLevel: string;
}
```

`buildConfigYaml` will render:

```yaml
server:
  port: 5678

default_provider: deepseek

providers:
  deepseek:
    api_key: ${DEEPSEEK_API_KEY}
    base_url: https://api.deepseek.com
  zhipu:
    api_key: ${ZHIPU_API_KEY}
    base_url: https://open.bigmodel.cn/api/coding/paas/v4

session:
  backend: sqlite
  sqlite:
    path: ...

logging:
  level: info
```

No aliases are added in this refactor. Keeping alias generation out avoids silently choosing model names across providers and keeps the output focused on connection setup.

## Interaction Details

Use `@clack/prompts` primitives already in the project:

- `clack.multiselect` for provider selection
- `clack.text` for API key / env placeholder
- `clack.select` for base URL, default provider, session backend, and log level

Prompt labels should be provider-specific:

- `DeepSeek API key (or env var like ${DEEPSEEK_API_KEY}):`
- `DeepSeek base URL:`

The default provider prompt is skipped when exactly one provider is selected.

## Testing

Unit tests in `src/cli/init.test.ts` should cover:

- provider catalog includes `openai`, `zhipu`, and `deepseek`
- YAML renders multiple providers
- YAML sets `default_provider` to the chosen provider
- SQLite config remains included only for sqlite
- memory config omits sqlite
- Zhipu coding-plan and standard base URLs remain available
- DeepSeek and OpenAI default base URLs render correctly

The implementation should keep tests at the YAML/catalog level. The interactive `runInit` function can be tested through small helper functions if needed, but no new test framework or terminal UI harness should be introduced.

## Out Of Scope

- Changing `GodeXConfig`
- Adding model alias generation
- Validating API keys against remote providers
- Editing existing config files in place
- Adding a non-interactive `godex init --provider` mode

## Acceptance Criteria

- `godex init` can generate config for OpenAI, Zhipu, DeepSeek, or any combination of them.
- Generated YAML validates with existing `buildConfig` and `config check` rules.
- Provider-specific prompt/base URL metadata is no longer hard-coded throughout `init.ts`.
- Existing Zhipu init behaviour remains available.
- `bun run typecheck`, `bun run lint`, and focused CLI init tests pass.
