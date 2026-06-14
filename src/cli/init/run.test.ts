import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
	chmodSync,
	existsSync,
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
} from "../../providers/deepseek";
import {
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";
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
		const textAnswers = [
			DEFAULT_DEEPSEEK_BASE_URL,
			"deepseek-key",
			ZHIPU_CODING_PLAN_BASE_URL,
			"zhipu-key",
			"6789",
		];
		const selectAnswers = [ZHIPU_PROVIDER_NAME, "memory", "debug"];

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "note").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([
			DEEPSEEK_PROVIDER_NAME,
			ZHIPU_PROVIDER_NAME,
		]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);
		spyOn(clack, "confirm").mockResolvedValue(true as never);

		try {
			await runInit({ configPath });

			const config = buildConfig(
				yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>,
				{},
			);
			expect(config.server.port).toBe(6789);
			expect(config.default_provider).toBe(ZHIPU_PROVIDER_NAME);
			expect(
				config.providers[DEEPSEEK_PROVIDER_NAME]?.credentials.api_key,
			).toBe("deepseek-key");
			expect(config.providers[ZHIPU_PROVIDER_NAME]?.credentials.api_key).toBe(
				"zhipu-key",
			);
			expect(config.session.backend).toBe("memory");
			expect(config.logging.level).toBe("debug");
			expect(config.models?.aliases?.["*"]).toBe("zhipu/glm-5.2");
			expect(statSync(configPath).mode & 0o777).toBe(0o600);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("creates parent directories for selected config path", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "missing", ".godex", "config.yaml");
		const textAnswers = [DEFAULT_DEEPSEEK_BASE_URL, "deepseek-key", "5678"];
		const selectAnswers = [configPath, "memory", "info"];

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "note").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([DEEPSEEK_PROVIDER_NAME]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);
		spyOn(clack, "confirm").mockResolvedValue(true as never);

		try {
			await runInit({});

			expect(existsSync(configPath)).toBeTrue();
			const config = buildConfig(
				yaml.load(readFileSync(configPath, "utf-8")) as Record<string, unknown>,
				{},
			);
			expect(config.default_provider).toBe(DEEPSEEK_PROVIDER_NAME);
			expect(statSync(configPath).mode & 0o777).toBe(0o600);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("cancels when overwrite confirm is declined", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "godex.yaml");
		writeFileSync(configPath, "old config", { mode: 0o666 });

		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "confirm").mockResolvedValue(false as never);
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		try {
			await runInit({ configPath });

			expect(readFileSync(configPath, "utf-8")).toBe("old config");
			expect(cancel).toHaveBeenCalledWith("Operation cancelled");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("cancels when preview confirm is declined", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "godex.yaml");
		const textAnswers = [DEFAULT_DEEPSEEK_BASE_URL, "deepseek-key", "5678"];
		const selectAnswers = ["memory", "info"];

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "note").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([DEEPSEEK_PROVIDER_NAME]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);
		spyOn(clack, "confirm").mockResolvedValue(false as never);
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		try {
			await runInit({ configPath });

			expect(existsSync(configPath)).toBeFalse();
			expect(cancel).toHaveBeenCalledWith("Operation cancelled");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("preview masks API keys but writes real values", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "godex.yaml");
		const textAnswers = [
			DEFAULT_DEEPSEEK_BASE_URL,
			"sk-real-secret-key-12345",
			"5678",
		];
		const selectAnswers = ["memory", "info"];
		let noteContent = "";

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "outro").mockImplementation(() => {});
		spyOn(clack, "note").mockImplementation((content) => {
			noteContent = content as string;
		});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([DEEPSEEK_PROVIDER_NAME]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);
		spyOn(clack, "confirm").mockResolvedValue(true as never);

		try {
			await runInit({ configPath });

			expect(noteContent).not.toContain("sk-real-secret-key-12345");
			expect(noteContent).toContain("sk-r…2345");
			const fileContent = readFileSync(configPath, "utf-8");
			expect(fileContent).toContain("sk-real-secret-key-12345");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
