import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import { Command } from "commander";
import { DEFAULT_DEEPSEEK_BASE_URL } from "../../providers/deepseek";
import { registerInitCommand } from "./init";

const tempDirs: string[] = [];

afterEach(() => {
	mock.restore();
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("registerInitCommand", () => {
	test("writes the wizard config to the requested config path", async () => {
		const tempDir = mkdtempSync(join(tmpdir(), "godex-init-command-"));
		tempDirs.push(tempDir);
		const configPath = join(tempDir, "custom-godex.yaml");

		const textAnswers = ["deepseek-key", "5678"];
		const selectAnswers = [DEFAULT_DEEPSEEK_BASE_URL, "memory", "info"];
		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "cancel").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue(["deepseek"] as never);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);

		const program = new Command();
		program.exitOverride();
		registerInitCommand(program);

		await program.parseAsync(
			["node", "godex", "init", "--config", configPath],
			{
				from: "node",
			},
		);

		expect(existsSync(configPath)).toBe(true);
		expect(readFileSync(configPath, "utf-8")).toContain(
			"default_provider: deepseek",
		);
	});
});
