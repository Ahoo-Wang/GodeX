// src/adapter/utils.ts
// Generic type-checking helpers shared across the adapter layer.

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
