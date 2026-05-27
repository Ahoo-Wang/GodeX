import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export function loadConfigFromFile(
	configPath: string,
): Record<string, unknown> | null {
	const absolute = resolve(configPath);
	if (!existsSync(absolute)) return null;
	const raw = readFileSync(absolute, "utf-8");
	const parsed = yaml.load(raw);
	return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: {};
}
