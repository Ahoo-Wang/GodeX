import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";

export function loadConfigFromFile(
	configPath: string,
): Record<string, unknown> | null {
	const absolute = resolve(configPath);
	if (!existsSync(absolute)) return null;

	let raw: string;
	try {
		if (!statSync(absolute).isFile()) {
			throw new Error("path is not a file");
		}
		raw = readFileSync(absolute, "utf-8");
	} catch (error) {
		throw new Error(`Failed to read config file: ${configPath}`, {
			cause: error,
		});
	}

	let parsed: unknown;
	try {
		// js-yaml v5 throws on empty input ("expected a document, but the input
		// is empty"); treat an empty document as an empty object instead.
		parsed = raw.trim() === "" ? null : load(raw);
	} catch (error) {
		throw new Error(`Failed to parse config file: ${configPath}`, {
			cause: error,
		});
	}

	return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
		? (parsed as Record<string, unknown>)
		: {};
}
