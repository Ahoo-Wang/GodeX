import { describe, expect, test } from "bun:test";
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
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu/provider";
import { buildConfigYaml } from "./config-yaml";
import type { InitConfigYamlOptions } from "./model";

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

	test("renders selected provider base URLs", () => {
		expect(
			buildConfigYaml({
				...baseOpts,
				providers: [
					{
						id: ZHIPU_PROVIDER_NAME,
						apiKey: "${ZHIPU_API_KEY}",
						baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
					},
				],
			}),
		).toContain(`base_url: ${ZHIPU_CODING_PLAN_BASE_URL}`);
		expect(
			buildConfigYaml({
				...baseOpts,
				providers: [
					{
						id: ZHIPU_PROVIDER_NAME,
						apiKey: "${ZHIPU_API_KEY}",
						baseUrl: ZHIPU_BASE_URL,
					},
				],
			}),
		).toContain(`base_url: ${ZHIPU_BASE_URL}`);
	});

	test("renders multiple providers and selected default provider", () => {
		const rawYaml = buildConfigYaml({
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

		expect(rawYaml).toContain("default_provider: deepseek");
		expect(rawYaml).toContain("  deepseek:");
		expect(rawYaml).toContain("    api_key: ${DEEPSEEK_API_KEY}");
		expect(rawYaml).toContain(`    base_url: ${DEFAULT_DEEPSEEK_BASE_URL}`);
		expect(rawYaml).toContain("  openai:");
		expect(rawYaml).toContain("    api_key: ${OPENAI_API_KEY}");
		expect(rawYaml).toContain(`    base_url: ${DEFAULT_OPENAI_BASE_URL}`);
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

	test("quotes provider values so YAML syntax does not alter secrets", () => {
		const rawYaml = buildConfigYaml({
			...baseOpts,
			providers: [
				{
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "secret # not a comment",
					baseUrl: "https://example.test/api?target=a: b",
				},
			],
		});

		const parsed = yaml.load(rawYaml) as Record<string, unknown>;
		const config = buildConfig(parsed, {});

		expect(config.providers[ZHIPU_PROVIDER_NAME]?.api_key).toBe(
			"secret # not a comment",
		);
		expect(config.providers[ZHIPU_PROVIDER_NAME]?.base_url).toBe(
			"https://example.test/api?target=a: b",
		);
	});

	test("writes multiline provider values as valid YAML scalars", () => {
		const rawYaml = buildConfigYaml({
			...baseOpts,
			providers: [
				{
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "line-one\nline-two",
					baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
				},
			],
		});

		const parsed = yaml.load(rawYaml) as Record<string, unknown>;
		const config = buildConfig(parsed, {});

		expect(config.providers[ZHIPU_PROVIDER_NAME]?.api_key).toBe(
			"line-one\nline-two",
		);
	});

	test("renders sqlite path only for sqlite sessions", () => {
		const sqliteYaml = buildConfigYaml({
			...baseOpts,
			sessionBackend: "sqlite",
		});
		const memoryYaml = buildConfigYaml({
			...baseOpts,
			sessionBackend: "memory",
		});

		expect(sqliteYaml).toContain("sqlite:");
		expect(sqliteYaml).toContain("path:");
		expect(memoryYaml).not.toContain("sqlite:");
	});
});
