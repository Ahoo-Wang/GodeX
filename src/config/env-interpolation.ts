import { createConfigMap } from "./raw";

export function resolveEnvVars(value: string): string {
	return value.replace(/\$\{(\w+)\}/g, (match, name: string) => {
		return process.env[name] ?? match;
	});
}

export function resolveEnvVarsDeep(obj: unknown): unknown {
	if (typeof obj === "string") return resolveEnvVars(obj);
	if (Array.isArray(obj)) return obj.map(resolveEnvVarsDeep);
	if (obj !== null && typeof obj === "object") {
		const result = createConfigMap<unknown>();
		for (const [key, value] of Object.entries(obj)) {
			result[key] = resolveEnvVarsDeep(value);
		}
		return result;
	}
	return obj;
}
