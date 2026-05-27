import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

	test("returns an existing search path when local config is absent", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-path-"));
		try {
			process.chdir(dir);

			expect(resolveDefaultConfigPath()).toBeString();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("uses local sqlite defaults in dev builds", () => {
		expect(resolveDefaultSqlitePath()).toBe("./data/sessions.db");
		expect(resolveDefaultTracePath()).toBe("./data/trace.db");
	});
});
