import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as clack from "@clack/prompts";
import yaml from "js-yaml";
import { buildConfig } from "../config";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../providers/deepseek/provider";
import {
	DEFAULT_OPENAI_BASE_URL,
	OPENAI_PROVIDER_NAME,
} from "../providers/openai/provider";
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../providers/zhipu/provider";
import {
	buildConfigYaml,
	type InitConfigYamlOptions,
	resolveDefaultProvider,
	runInit,
} from "./init";
import {
	getInitProviderDefinition,
	INIT_PROVIDER_DEFINITIONS,
} from "./init-providers";

afterEach(() => {
	mock.restore();
});

describe("INIT_PROVIDER_DEFINITIONS", () => {
	test("includes OpenAI, Zhipu, and DeepSeek", () => {
		expect(INIT_PROVIDER_DEFINITIONS.map((provider) => provider.id)).toEqual([
			OPENAI_PROVIDER_NAME,
			ZHIPU_PROVIDER_NAME,
			DEEPSEEK_PROVIDER_NAME,
		]);
	});

	test("defines provider-specific API key placeholders and base URLs", () => {
		expect(getInitProviderDefinition("openai")).toMatchObject({
			apiKeyPlaceholder: "${OPENAI_API_KEY}",
			defaultBaseUrl: DEFAULT_OPENAI_BASE_URL,
		});
		expect(getInitProviderDefinition("deepseek")).toMatchObject({
			apiKeyPlaceholder: "${DEEPSEEK_API_KEY}",
			defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
		});
		expect(
			getInitProviderDefinition("zhipu")?.baseUrlChoices.map(
				(choice) => choice.value,
			),
		).toEqual([ZHIPU_CODING_PLAN_BASE_URL, ZHIPU_BASE_URL]);
	});
});

describe("runInit", () => {
	test("walks the multi-provider wizard and writes loadable config", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-"));
		const configPath = join(dir, "godex.yaml");
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
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test("cancels before writing config when provider selection is cancelled", async () => {
		const dir = mkdtempSync(join(tmpdir(), "godex-init-cancel-"));
		const configPath = join(dir, "godex.yaml");
		const cancelToken = Symbol("cancel");
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "multiselect").mockResolvedValue(cancelToken as never);
		spyOn(clack, "isCancel").mockImplementation(
			(value): value is symbol => value === cancelToken,
		);

		try {
			await runInit({ configPath });

			expect(cancel).toHaveBeenCalledWith("Operation cancelled");
			expect(() => readFileSync(configPath, "utf-8")).toThrow();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("buildConfigYaml", () => {
	const baseOpts = {
		defaultProvider: ZHIPU_PROVIDER_NAME,
		providers: [
			{
				id: ZHIPU_PROVIDER_NAME,
				apiKey: "${ZHIPU_API_KEY}",
				baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
			},
		],
		port: "5678",
		sessionBackend: "sqlite" as const,
		logLevel: "info",
	} satisfies InitConfigYamlOptions;

	test("uses coding plan base URL when selected", () => {
		const yaml = buildConfigYaml({
			...baseOpts,
			providers: [
				{
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "${ZHIPU_API_KEY}",
					baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
				},
			],
		});
		expect(yaml).toContain(`base_url: ${ZHIPU_CODING_PLAN_BASE_URL}`);
	});

	test("uses standard base URL when selected", () => {
		const yaml = buildConfigYaml({
			...baseOpts,
			providers: [
				{
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "${ZHIPU_API_KEY}",
					baseUrl: ZHIPU_BASE_URL,
				},
			],
		});
		expect(yaml).toContain(`base_url: ${ZHIPU_BASE_URL}`);
	});

	test("renders multiple providers and selected default provider", () => {
		const yaml = buildConfigYaml({
			...baseOpts,
			defaultProvider: DEEPSEEK_PROVIDER_NAME,
			providers: [
				{
					id: DEEPSEEK_PROVIDER_NAME,
					apiKey: "${DEEPSEEK_API_KEY}",
					baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
				},
				{
					id: OPENAI_PROVIDER_NAME,
					apiKey: "${OPENAI_API_KEY}",
					baseUrl: DEFAULT_OPENAI_BASE_URL,
				},
			],
		});

		expect(yaml).toContain("default_provider: deepseek");
		expect(yaml).toContain("  deepseek:");
		expect(yaml).toContain("    api_key: ${DEEPSEEK_API_KEY}");
		expect(yaml).toContain(`    base_url: ${DEFAULT_DEEPSEEK_BASE_URL}`);
		expect(yaml).toContain("  openai:");
		expect(yaml).toContain("    api_key: ${OPENAI_API_KEY}");
		expect(yaml).toContain(`    base_url: ${DEFAULT_OPENAI_BASE_URL}`);
	});

	test("renders multi-provider YAML accepted by the config loader", () => {
		const rawYaml = buildConfigYaml({
			...baseOpts,
			defaultProvider: DEEPSEEK_PROVIDER_NAME,
			providers: [
				{
					id: DEEPSEEK_PROVIDER_NAME,
					apiKey: "deepseek-test-key",
					baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
				},
				{
					id: OPENAI_PROVIDER_NAME,
					apiKey: "openai-test-key",
					baseUrl: DEFAULT_OPENAI_BASE_URL,
				},
			],
			sessionBackend: "memory",
			logLevel: "warn",
		});

		const parsed = yaml.load(rawYaml) as Record<string, unknown>;
		const config = buildConfig(parsed, {});

		expect(config.default_provider).toBe(DEEPSEEK_PROVIDER_NAME);
		expect(Object.keys(config.providers)).toEqual([
			DEEPSEEK_PROVIDER_NAME,
			OPENAI_PROVIDER_NAME,
		]);
		expect(config.providers[DEEPSEEK_PROVIDER_NAME]).toEqual({
			api_key: "deepseek-test-key",
			base_url: DEFAULT_DEEPSEEK_BASE_URL,
		});
		expect(config.session.backend).toBe("memory");
		expect(config.logging.level).toBe("warn");
	});

	test("includes sqlite path for sqlite backend", () => {
		const yaml = buildConfigYaml({ ...baseOpts, sessionBackend: "sqlite" });
		expect(yaml).toContain("sqlite:");
		expect(yaml).toContain("path:");
	});

	test("omits sqlite config for memory backend", () => {
		const yaml = buildConfigYaml({ ...baseOpts, sessionBackend: "memory" });
		expect(yaml).not.toContain("sqlite:");
	});
});

describe("resolveDefaultProvider", () => {
	test("uses the only configured provider without prompting", () => {
		expect(resolveDefaultProvider([DEEPSEEK_PROVIDER_NAME], undefined)).toBe(
			DEEPSEEK_PROVIDER_NAME,
		);
	});

	test("uses selected default when multiple providers are configured", () => {
		expect(
			resolveDefaultProvider(
				[DEEPSEEK_PROVIDER_NAME, OPENAI_PROVIDER_NAME],
				OPENAI_PROVIDER_NAME,
			),
		).toBe(OPENAI_PROVIDER_NAME);
	});

	test("rejects a selected default that is not configured", () => {
		expect(() =>
			resolveDefaultProvider(
				[DEEPSEEK_PROVIDER_NAME, OPENAI_PROVIDER_NAME],
				ZHIPU_PROVIDER_NAME,
			),
		).toThrow('Default provider "zhipu" is not configured');
	});
});
