import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	CONFIG_SEARCH_PATHS,
	resolveDefaultConfigPath,
	resolveDefaultSqlitePath,
	resolveDefaultTracePath,
} from "./paths";

describe("config paths", () => {
	const originalCwd = process.cwd();

	afterEach(() => {
		process.chdir(originalCwd);
	});

	test("uses local godex.yaml as the first config search hit", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-path-"));
		try {
			writeFileSync(join(dir, "godex.yaml"), "providers: {}\n");
			process.chdir(dir);

			expect(resolveDefaultConfigPath()).toBe("godex.yaml");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("returns the first existing search path", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-path-"));
		try {
			const missingPath = join(dir, "missing.yaml");
			const existingPath = join(dir, "config.yaml");
			writeFileSync(existingPath, "providers: {}\n");

			expect(resolveDefaultConfigPath([missingPath, existingPath])).toBe(
				existingPath,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("falls back to the first search path when none exist", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-path-"));
		try {
			const preferredPath = join(dir, "preferred.yaml");

			expect(resolveDefaultConfigPath([preferredPath])).toBe(preferredPath);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("falls back to the default search path when candidates are empty", () => {
		expect(resolveDefaultConfigPath([])).toBe("godex.yaml");
	});

	test("exposes immutable config search paths", () => {
		expect(Object.isFrozen(CONFIG_SEARCH_PATHS)).toBe(true);
		expect(CONFIG_SEARCH_PATHS).toEqual([
			"godex.yaml",
			join(homedir(), ".godex", "config.yaml"),
		]);
	});

	test("uses local sqlite defaults in dev builds", () => {
		expect(resolveDefaultSqlitePath()).toBe("./data/sessions.db");
		expect(resolveDefaultTracePath()).toBe("./data/trace.db");
	});

	test("uses home data defaults in prod builds", () => {
		const buildEnv = globalThis as { GODEX_BUILD_ENV?: string };
		const originalBuildEnv = buildEnv.GODEX_BUILD_ENV;
		buildEnv.GODEX_BUILD_ENV = "prod";
		try {
			expect(resolveDefaultSqlitePath()).toBe(
				join(homedir(), ".godex", "data", "sessions.db"),
			);
			expect(resolveDefaultTracePath()).toBe(
				join(homedir(), ".godex", "data", "trace.db"),
			);
		} finally {
			if (originalBuildEnv === undefined) {
				delete buildEnv.GODEX_BUILD_ENV;
			} else {
				buildEnv.GODEX_BUILD_ENV = originalBuildEnv;
			}
		}
	});
});
