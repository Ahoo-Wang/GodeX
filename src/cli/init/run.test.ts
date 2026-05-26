import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import yaml from "js-yaml";
import { buildConfig } from "../../config";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek/provider";
import {
	DEFAULT_OPENAI_BASE_URL,
	OPENAI_PROVIDER_NAME,
} from "../../providers/openai/provider";
import { runInit } from "./run";

afterEach(() => {
	mock.restore();
});

describe("runInit", () => {
	test("walks the multi-provider wizard and writes loadable config", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "godex.yaml");
		writeFileSync(configPath, "old config", { mode: 0o666 });
		chmodSync(configPath, 0o666);
		const textAnswers = ["deepseek-key", "openai-key", "6789"];
		const selectAnswers = [
			DEFAULT_DEEPSEEK_BASE_URL,
			DEFAULT_OPENAI_BASE_URL,
			OPENAI_PROVIDER_NAME,
			"memory",
			"debug",
		];

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([
			DEEPSEEK_PROVIDER_NAME,
			OPENAI_PROVIDER_NAME,
		]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);

		try {
			await runInit({ configPath });

			const config = buildConfig(
				yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>,
				{},
			);
			expect(config.server.port).toBe(6789);
			expect(config.default_provider).toBe(OPENAI_PROVIDER_NAME);
			expect(config.providers[DEEPSEEK_PROVIDER_NAME]?.api_key).toBe(
				"deepseek-key",
			);
			expect(config.providers[OPENAI_PROVIDER_NAME]?.api_key).toBe(
				"openai-key",
			);
			expect(config.session.backend).toBe("memory");
			expect(config.logging.level).toBe("debug");
			expect(statSync(configPath).mode & 0o777).toBe(0o600);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
