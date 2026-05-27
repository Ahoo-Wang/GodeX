# Interactive Multi-Provider Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Refactor `godex init` so it can generate a valid config for OpenAI, Zhipu, DeepSeek, or any selected combination.

**Architecture:** Keep init as a CLI-only flow. Provider metadata lives in an init provider catalog, prompt orchestration lives in the wizard module, default-provider selection is isolated, YAML rendering accepts an explicit config model and validates its input before writing a file.

**Tech Stack:** TypeScript strict mode, Bun test runner, Biome, `@clack/prompts`, `js-yaml`, existing provider constants and config schema.

---

## Current Status

Completed and reconciled on 2026-05-28.

The implementation is split into focused modules under `src/cli/init/`:

- `providers.ts` owns the CLI-only provider catalog.
- `prompts.ts` owns the interactive wizard.
- `default-provider.ts` owns default provider resolution.
- `config-yaml.ts` owns YAML rendering and validates that the default provider is rendered.
- `run.ts` owns config file creation.

Focused tests live next to those modules:

- `providers.test.ts` covers provider catalog shape.
- `prompts.test.ts` covers success, cancellation, and invalid input paths.
- `default-provider.test.ts` covers default provider resolution.
- `config-yaml.test.ts` covers generated YAML validity and renderer input validation.
- `run.test.ts` covers the end-to-end init write path.

No runtime config schema or provider mapper files changed.

---

### Task 1: Provider Catalog

**Files:**
- `src/cli/init/providers.ts`
- `src/cli/init/providers.test.ts`

- [x] **Step 1: Add catalog tests**

Cover wizard order, provider-specific API key placeholders, and provider base URL choices.

- [x] **Step 2: Implement provider catalog**

Expose `INIT_PROVIDER_DEFINITIONS`, `InitProviderId`, and `getInitProviderDefinition()`.

- [x] **Step 3: Verify catalog behavior**

Run: `bun test src/cli/init/providers.test.ts`

Expected: PASS.

### Task 2: Multi-Provider YAML Rendering

**Files:**
- `src/cli/init/config-yaml.ts`
- `src/cli/init/config-yaml.test.ts`
- `src/cli/init/model.ts`

- [x] **Step 1: Add YAML rendering tests**

Cover multiple providers, selected default provider, config-loader compatibility, YAML scalar quoting, multiline secrets, and sqlite path rendering.

- [x] **Step 2: Add renderer input validation**

`buildConfigYaml()` rejects a `defaultProvider` that is not present in the rendered provider list.

- [x] **Step 3: Verify YAML behavior**

Run: `bun test src/cli/init/config-yaml.test.ts`

Expected: PASS.

### Task 3: Multi-Provider Interactive Wizard

**Files:**
- `src/cli/init/prompts.ts`
- `src/cli/init/prompts.test.ts`
- `src/cli/init/default-provider.ts`
- `src/cli/init/default-provider.test.ts`

- [x] **Step 1: Add default provider resolution tests**

Cover empty provider selections, single-provider defaults, selected defaults, and invalid selected defaults.

- [x] **Step 2: Add wizard success-path tests**

Cover a single-provider flow without prompting for default provider and a multi-provider flow with an explicit selected default.

- [x] **Step 3: Add cancellation and invalid input tests**

Cover cancellation at provider selection, API key, base URL, default provider, port, session backend, log level, and invalid port input.

- [x] **Step 4: Verify wizard behavior**

Run: `bun test src/cli/init/prompts.test.ts src/cli/init/default-provider.test.ts`

Expected: PASS.

### Task 4: End-To-End Init Write Path

**Files:**
- `src/cli/init/run.ts`
- `src/cli/init/run.test.ts`
- `src/cli/commands/init.ts`
- `src/cli/commands/init.test.ts`

- [x] **Step 1: Verify generated config is loadable**

`runInit()` writes a 0600 config file from the multi-provider wizard and the config builder can load it.

- [x] **Step 2: Verify command wiring**

The `init --config <path>` command writes to the requested path.

- [x] **Step 3: Run focused init tests**

Run: `bun test src/cli/init src/cli/commands/init.test.ts`

Expected: PASS.

### Task 5: Final Verification

- [x] **Step 1: Run focused CLI tests**

Run: `bun test src/cli/init src/cli/runtime-config`

Expected: PASS.

- [x] **Step 2: Run project check**

Run: `bun run check`

Expected: PASS.
