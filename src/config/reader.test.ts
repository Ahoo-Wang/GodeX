import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfigFromFile } from "./reader";

describe("loadConfigFromFile", () => {
	test("returns null for a missing file", () => {
		expect(loadConfigFromFile("/tmp/godex-missing-config.yaml")).toBeNull();
	});

	test("loads YAML objects from disk", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			writeFileSync(
				configPath,
				"providers:\n  zhipu:\n    base_url: https://example.test/api\n",
			);

			expect(loadConfigFromFile(configPath)).toEqual({
				providers: {
					zhipu: {
						base_url: "https://example.test/api",
					},
				},
			});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("normalizes empty YAML files to an object", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			writeFileSync(configPath, "");

			expect(loadConfigFromFile(configPath)).toEqual({});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("normalizes non-object YAML documents to an object", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			writeFileSync(configPath, "true\n");

			expect(loadConfigFromFile(configPath)).toEqual({});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("normalizes array YAML documents to an object", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			writeFileSync(configPath, "- zhipu\n");

			expect(loadConfigFromFile(configPath)).toEqual({});
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reports file read failures with the config path", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			mkdirSync(configPath);

			expect(() => loadConfigFromFile(configPath)).toThrow(
				`Failed to read config file: ${configPath}`,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("reports YAML parse failures with the config path", () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-config-reader-"));
		try {
			const configPath = join(dir, "godex.yaml");
			writeFileSync(configPath, "providers:\n  - :\n");

			expect(() => loadConfigFromFile(configPath)).toThrow(
				`Failed to parse config file: ${configPath}`,
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
