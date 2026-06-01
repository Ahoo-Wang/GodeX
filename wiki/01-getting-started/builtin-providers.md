---
title: Built-in Providers
description: Comparison of DeepSeek, Zhipu, MiniMax, and Xiaomi built-in providers, their capabilities, default endpoints, and protocol-specific hooks.
---

# Built-in Providers

GodeX ships with four built-in providers that cover the most popular non-OpenAI LLM platforms. Each provider is a self-contained module that declares its capabilities, translates requests via hooks, and maps responses back into the standard Chat Completions accessors. Adding a new provider follows the same pattern -- implement a `ProviderSpec`, write hooks for request patching and response normalization, and register it with the `Registrar`.

## At a Glance

| Feature | DeepSeek | Zhipu | MiniMax | Xiaomi |
|---|---|---|---|---|
| **Spec Name** | `deepseek` | `zhipu` | `minimax` | `xiaomi` |
| **Default Base URL** | `api.deepseek.com` | `open.bigmodel.cn` (coding plan) | `api.minimaxi.com/v1` | `api.xiaomimimo.com/v1` |
| **Default Model** | `deepseek-v4-pro` | `glm-5.1` | `MiniMax-M3` | `mimo-v2.5-pro` |
| **Reasoning Effort** | `native` | `boolean` | `boolean` | `boolean` |
| **GodeX Input** | text | text | text, image, video | text |
| **Max Tools** | 128 | 128 | 128 | 128 |
| **Response Formats** | text, json_object | text, json_object | text, json_object | text, json_object |
| **Streaming Usage** | Yes | Yes | Yes | Yes |
| **Cached Tokens** | Yes | Yes | Yes | Yes |

## Provider Architecture

Every provider follows the same structural pattern: a `spec.ts` declares capabilities and creates the `ProviderSpec`, a `hooks.ts` implements request patching and response/stream accessors, a `client.ts` creates the `ProviderEdge` for making HTTP calls, and a `protocol/` directory contains provider-specific DTO types.

```mermaid
flowchart TB
    subgraph Shared["Shared Infrastructure"]
        Def["ProviderDefinition"]
        Reg["Registrar"]
    end

    subgraph DeepSeek["DeepSeek Module"]
        DS_Spec["spec.ts"]
        DS_Hooks["hooks.ts"]
        DS_Client["client.ts"]
        DS_Proto["protocol/"]
    end

    subgraph Zhipu["Zhipu Module"]
        ZP_Spec["spec.ts"]
        ZP_Hooks["hooks.ts"]
        ZP_Client["client.ts"]
        ZP_Proto["protocol/"]
    end

    subgraph MiniMax["MiniMax Module"]
        MM_Spec["spec.ts"]
        MM_Hooks["hooks.ts"]
        MM_Client["client.ts"]
        MM_Proto["protocol/"]
    end

    subgraph Xiaomi["Xiaomi Module"]
        XM_Spec["spec.ts"]
        XM_Hooks["hooks.ts"]
        XM_Client["client.ts"]
        XM_Proto["protocol/"]
    end

    DS_Spec --> Def
    ZP_Spec --> Def
    MM_Spec --> Def
    XM_Spec --> Def
    Def --> Reg

    DS_Hooks --> DS_Spec
    ZP_Hooks --> ZP_Spec
    MM_Hooks --> MM_Spec
    XM_Hooks --> XM_Spec

    style Shared fill:#161b22,stroke:#30363d,color:#e6edf3
    style DeepSeek fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Zhipu fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MiniMax fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Xiaomi fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Def fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style Reg fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style DS_Spec fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style DS_Hooks fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style DS_Client fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style DS_Proto fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ZP_Spec fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ZP_Hooks fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ZP_Client fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style ZP_Proto fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MM_Spec fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MM_Hooks fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MM_Client fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style MM_Proto fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style XM_Spec fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style XM_Hooks fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style XM_Client fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
    style XM_Proto fill:#2d333b,stroke:#6d5dfc,color:#e6edf3
```

All providers are registered at startup via `createBuiltinRegistrar` ([src/providers/builtin.ts:49-55](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/builtin.ts#L49-L55)), which creates a `Registrar` and registers each `ProviderDefinition`.

## Tool Capabilities Comparison

Each provider declares which tool types it supports and which ones must be **degraded** to a simpler form. Degradation means GodeX automatically converts an unsupported tool type into the nearest compatible type before sending it to the provider.

| Tool Type | DeepSeek | Zhipu | MiniMax | Xiaomi |
|---|---|---|---|---|
| `function` | Supported | Supported | Supported | Supported |
| `local_shell` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `shell` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `apply_patch` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `custom` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `tool_search` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `namespace` | Degraded to `function` | Degraded to `function` | Degraded to `function` | Degraded to `function` |
| `web_search` | - | Supported | - | - |
| `web_search_preview` | - | Degraded to `web_search` | - | - |
| `file_search` | - | Degraded to `retrieval` | - | - |
| `mcp` | - | Supported | - | - |

## Reasoning Support

Each provider handles reasoning (chain-of-thought) differently. The compatibility plan in the bridge kernel maps the incoming `reasoning_effort` to the provider-specific representation.

| Provider | Effort Type | Behavior |
|---|---|---|
| DeepSeek | `native` | Maps `high` -> `high`, `xhigh` -> `max`. Adds `thinking: {type: "enabled"}` to the request. |
| Zhipu | `boolean` | Adds `thinking: {type: "enabled", clear_thinking: false}` when reasoning content is detected. |
| MiniMax | `boolean` | Maps `reasoning.effort: "none"` to `thinking: {type: "disabled"}` and other effort values to MiniMax adaptive thinking. Reads reasoning output from `reasoning_content`. |
| Xiaomi | `boolean` | Bridge maps effort to `thinking: {type: "enabled"/"disabled"}`. Forces `thinking: enabled` when historical `reasoning_content` exists in messages. Defaults to `thinking: disabled` when no reasoning was requested. |

DeepSeek's `deepSeekPatchRequest` handles this mapping in [src/providers/deepseek/hooks.ts:113-136](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts#L113-L136), Zhipu's in [src/providers/zhipu/hooks.ts:113-134](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/hooks.ts#L113-L134), and Xiaomi's in [src/providers/xiaomi/hooks.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/xiaomi/hooks.ts).

## Tool Choice Support

| Provider | Supported Tool Choice Values |
|---|---|
| DeepSeek | `auto`, `none`, `required`, `function` |
| Zhipu | `auto`, `none` |
| MiniMax | `auto`, `none`, `required`, `function` |
| Xiaomi | `auto` |

## Provider Definition Registration

Each provider is wrapped in a `ProviderDefinition` that pairs the provider name with a factory function. The definitions are collected in `BUILTIN_PROVIDER_DEFINITIONS` and registered at startup ([src/providers/builtin.ts:22-41](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/builtin.ts#L22-L41)).

```mermaid
sequenceDiagram
    autonumber
    participant CLI as godex serve
    participant Builtin as createBuiltinRegistrar
    participant Registrar as Registrar
    participant DeepSeek as DeepSeek Definition
    participant Zhipu as Zhipu Definition
    participant MiniMax as MiniMax Definition
    participant Xiaomi as Xiaomi Definition

    CLI->>Builtin: createBuiltinRegistrar()
    Builtin->>Registrar: new Registrar()
    Builtin->>Registrar: registerDefinitions([DeepSeek, Zhipu, MiniMax, Xiaomi])
    Registrar->>DeepSeek: register(deepseek)
    Registrar->>Zhipu: register(zhipu)
    Registrar->>MiniMax: register(minimax)
    Registrar->>Xiaomi: register(xiaomi)
    Registrar-->>CLI: registrar with 4 providers
```

The `ProviderDefinition` interface, defined in [src/providers/definition.ts:6-11](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/definition.ts#L6-11), requires a `name` and a `create` factory function that produces a `ProviderEdge` from a `ProviderRuntimeConfig`.

## Provider Specs

### DeepSeek

The DeepSeek spec targets the standard Chat Completions API at `https://api.deepseek.com` ([src/providers/deepseek/spec.ts:24-54](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/spec.ts#L24-L54)).

| Property | Value |
|---|---|
| Name | `deepseek` |
| Protocol | `chat_completions` |
| Default Base URL | `https://api.deepseek.com` |
| Default Model | `deepseek-v4-pro` |
| Auth | Bearer |
| Reasoning | Native effort levels |

### Zhipu

The Zhipu spec defaults to the coding plan endpoint at `https://open.bigmodel.cn/api/coding/paas/v4` ([src/providers/zhipu/spec.ts:24-57](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/spec.ts#L24-57)).

| Property | Value |
|---|---|
| Name | `zhipu` |
| Protocol | `chat_completions` |
| Default Base URL | `https://open.bigmodel.cn/api/coding/paas/v4` |
| Default Model | `glm-5.1` |
| Auth | Bearer |
| Reasoning | Boolean (thinking enabled/disabled) |

### MiniMax

The MiniMax spec targets `https://api.minimaxi.com/v1` ([src/providers/minimax/spec.ts:25-56](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/minimax/spec.ts#L25-L56)).

| Property | Value |
|---|---|
| Name | `minimax` |
| Protocol | `chat_completions` |
| Default Base URL | `https://api.minimaxi.com/v1` |
| Default Model | `MiniMax-M3` |
| Auth | Bearer |
| Reasoning | Boolean (adaptive/disabled thinking, returned as `reasoning_content`) |
| Input | Text, image, and video content parts |

### Xiaomi

The Xiaomi spec targets the MiMo API at `https://api.xiaomimimo.com/v1` ([src/providers/xiaomi/spec.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/xiaomi/spec.ts)).

| Property | Value |
|---|---|
| Name | `xiaomi` |
| Protocol | `chat_completions` |
| Default Base URL | `https://api.xiaomimimo.com/v1` |
| Default Model | `mimo-v2.5-pro` |
| Auth | Bearer |
| Reasoning | Boolean (thinking enabled/disabled) |
| Env Variable | `MIMO_API_KEY` |

## Next Steps

| Topic | Description |
|---|---|
| [Configuration](./configuration.md) | How to configure providers in `godex.yaml` |
| [Quick Start](./quick-start.md) | Install and make your first call |
| [Overview](./overview.md) | Architecture and design concepts |

## References

- [src/providers/builtin.ts:1-55](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/builtin.ts#L1-L55) - Provider definitions and registrar
- [src/providers/deepseek/spec.ts:1-57](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/spec.ts#L1-57) - DeepSeek spec definition
- [src/providers/deepseek/hooks.ts:18-57](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/deepseek/hooks.ts#L18-57) - DeepSeek capabilities and hooks
- [src/providers/zhipu/spec.ts:1-59](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/spec.ts#L1-59) - Zhipu spec definition
- [src/providers/zhipu/hooks.ts:16-69](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/zhipu/hooks.ts#L16-69) - Zhipu capabilities and hooks
- [src/providers/minimax/spec.ts:1-58](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/minimax/spec.ts#L1-L58) - MiniMax spec definition
- [src/providers/minimax/hooks.ts:24-62](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/minimax/hooks.ts#L24-L62) - MiniMax capabilities and hooks
- [src/providers/xiaomi/spec.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/xiaomi/spec.ts) - Xiaomi spec definition
- [src/providers/xiaomi/hooks.ts](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/xiaomi/hooks.ts) - Xiaomi capabilities and hooks
- [src/providers/definition.ts:6-29](https://github.com/Ahoo-Wang/GodeX/blob/main/src/providers/definition.ts#L6-29) - ProviderDefinition interface
- [src/bridge/provider-spec/contract.ts:54-74](https://github.com/Ahoo-Wang/GodeX/blob/main/src/bridge/provider-spec/contract.ts#L54-74) - ProviderSpec contract
