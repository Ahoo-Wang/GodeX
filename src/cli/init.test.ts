import { describe, expect, test } from "bun:test";
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
} from "../providers/zhipu/provider";
import { buildConfigYaml, resolveDefaultProvider } from "./init";
import {
	getInitProviderDefinition,
	INIT_PROVIDER_DEFINITIONS,
} from "./init-providers";

describe("INIT_PROVIDER_DEFINITIONS", () => {
	test("includes OpenAI, Zhipu, and DeepSeek", () => {
		expect(INIT_PROVIDER_DEFINITIONS.map((provider) => provider.id)).toEqual([
			OPENAI_PROVIDER_NAME,
			"zhipu",
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

describe("buildConfigYaml", () => {
	const baseOpts = {
		defaultProvider: "zhipu",
		providers: [
			{
				id: "zhipu",
				apiKey: "${ZHIPU_API_KEY}",
				baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
			},
		],
		port: "5678",
		sessionBackend: "sqlite" as const,
		logLevel: "info",
	};

	test("uses coding plan base URL when selected", () => {
		const yaml = buildConfigYaml({
			...baseOpts,
			providers: [
				{
					id: "zhipu",
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
					id: "zhipu",
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
			defaultProvider: "deepseek",
			providers: [
				{
					id: "deepseek",
					apiKey: "${DEEPSEEK_API_KEY}",
					baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
				},
				{
					id: "openai",
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
		expect(resolveDefaultProvider(["deepseek"], undefined)).toBe("deepseek");
	});

	test("uses selected default when multiple providers are configured", () => {
		expect(resolveDefaultProvider(["deepseek", "openai"], "openai")).toBe(
			"openai",
		);
	});
});
