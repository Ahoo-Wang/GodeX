import { describe, expect, test } from "bun:test";
import yaml from "js-yaml";
import { buildConfig } from "../../config";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";
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
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "${ZHIPU_API_KEY}",
					baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
				},
			],
		});

		expect(rawYaml).toContain("default_provider: deepseek");
		expect(rawYaml).not.toContain(["builtin", ":"].join(""));
		expect(rawYaml).toContain("  deepseek:");
		expect(rawYaml).toContain("    spec: deepseek");
		expect(rawYaml).toContain("      api_key: ${DEEPSEEK_API_KEY}");
		expect(rawYaml).toContain(`      base_url: ${DEFAULT_DEEPSEEK_BASE_URL}`);
		expect(rawYaml).toContain("  zhipu:");
		expect(rawYaml).toContain("    spec: zhipu");
		expect(rawYaml).toContain("      api_key: ${ZHIPU_API_KEY}");
		expect(rawYaml).toContain(`      base_url: ${ZHIPU_CODING_PLAN_BASE_URL}`);
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
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "zhipu-test-key",
					baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
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
			ZHIPU_PROVIDER_NAME,
		]);
		expect(config.providers[DEEPSEEK_PROVIDER_NAME]).toEqual({
			spec: DEEPSEEK_PROVIDER_NAME,
			credentials: { api_key: "deepseek-test-key" },
			endpoint: { base_url: DEFAULT_DEEPSEEK_BASE_URL },
		});
		expect(config.session.backend).toBe("memory");
		expect(config.logging.level).toBe("warn");
	});

	test("rejects a default provider that is not rendered", () => {
		expect(() =>
			buildConfigYaml({
				...baseOpts,
				defaultProvider: DEEPSEEK_PROVIDER_NAME,
			}),
		).toThrow('Default provider "deepseek" is not configured');
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

		expect(config.providers[ZHIPU_PROVIDER_NAME]?.credentials.api_key).toBe(
			"secret # not a comment",
		);
		expect(config.providers[ZHIPU_PROVIDER_NAME]?.endpoint?.base_url).toBe(
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

		expect(config.providers[ZHIPU_PROVIDER_NAME]?.credentials.api_key).toBe(
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
