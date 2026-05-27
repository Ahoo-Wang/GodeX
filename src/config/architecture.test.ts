import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_ROOT = fileURLToPath(new URL(".", import.meta.url));

describe("config architecture", () => {
	test("does not keep a legacy loader compatibility layer", () => {
		expect(existsSync(join(CONFIG_ROOT, "loader.ts"))).toBe(false);
		expect(existsSync(join(CONFIG_ROOT, "loader.test.ts"))).toBe(false);
	});
});
