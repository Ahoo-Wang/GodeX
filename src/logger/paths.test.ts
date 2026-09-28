import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import path from "node:path";
import { expandHomeDir } from "./paths";

function restoreHome(originalHome: string | undefined): void {
	if (originalHome === undefined) {
		delete process.env.HOME;
		return;
	}
	process.env.HOME = originalHome;
}

describe("logger path helpers", () => {
	test("expands leading ~/ with HOME", () => {
		const originalHome = process.env.HOME;
		process.env.HOME = "/tmp/godex-home";
		try {
			expect(expandHomeDir("~/logs")).toBe(
				path.join("/tmp/godex-home", "logs"),
			);
		} finally {
			restoreHome(originalHome);
		}
	});

	test("expands leading ~/ with os homedir when HOME is unset", () => {
		const originalHome = process.env.HOME;
		delete process.env.HOME;
		try {
			expect(expandHomeDir("~/logs")).toBe(path.join(homedir(), "logs"));
		} finally {
			restoreHome(originalHome);
		}
	});

	test("leaves non-home paths unchanged", () => {
		expect(expandHomeDir("/var/log/godex")).toBe("/var/log/godex");
		expect(expandHomeDir("relative/logs")).toBe("relative/logs");
	});
});
