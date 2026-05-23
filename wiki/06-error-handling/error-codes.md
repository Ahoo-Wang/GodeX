---
title: "Error Codes"
description: "Complete reference of domain-specific error codes used throughout GodeX."
---

# Error Codes

## Adapter Domain

| Code | Description |
|------|-------------|
| `adapter.request.unsupported_parameter` | Request contains a parameter not supported by the provider |
| `adapter.request.tool_skipped` | A tool was skipped because it is not supported |
| `adapter.request.unsupported_input_item` | Input item type not supported by the provider |
| `adapter.request.unsupported_input_content` | Input content type not supported |
| `adapter.request.unsupported_tool` | Tool type not in the provider's `supportedToolTypes` |

## Provider Domain

| Code | Description |
|------|-------------|
| `provider.upstream.rate_limit` | Upstream API rate limit exceeded |
| `provider.upstream.timeout` | Upstream API request timed out |
| `provider.upstream.server_error` | Upstream returned a 5xx error |
| `provider.upstream.error` | Generic upstream communication failure |

## Session Domain

| Code | Description |
|------|-------------|
| `session.chain.not_found` | Referenced response ID does not exist |
| `session.chain.cycle_detected` | Chain traversal found a cycle |
| `session.chain.depth_exceeded` | Chain depth exceeded the limit (default: 64) |
| `session.chain.unavailable` | Referenced response is not completed |
| `session.store.conflict` | Duplicate save or parent pointer mismatch |

## Server Domain

| Code | Description |
|------|-------------|
| `server.request.invalid_json` | Request body is not valid JSON |
| `server.request.missing_model` | Required `model` field is missing |
| `server.request.invalid_parameter` | Parameter validation failed |
| `server.provider.not_registered` | Provider has no registered factory |
| `server_error` | Catch-all server error |

[Configuration](/07-configuration/config-schema)
