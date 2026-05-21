// src/providers/zhipu/function-names.ts

export function toZhipuFunctionName(name: string): string {
	const sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_");
	return sanitized || "codex_tool";
}
