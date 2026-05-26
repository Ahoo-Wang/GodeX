export function toDeepSeekFunctionName(name: string): string {
	const normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
	return normalized.length > 0 ? normalized : "tool";
}
