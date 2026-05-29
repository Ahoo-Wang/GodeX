import { describe, expect, test } from "bun:test";
import { buildConfig } from "../../config";
import { assertConfigReady, collectConfigDiagnostics } from "./diagnostics";

const baseRawConfig = {
	server: { port: 3000 },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			spec: "zhipu",
			credentials: { api_key: "secret-key" },
			endpoint: { base_url: "https://example.test/api" },
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

describe("collectConfigDiagnostics", () => {
	test("returns no diagnostics when config is ready", () => {
		const config = buildConfig(baseRawConfig, {});

		expect(
			collectConfigDiagnostics(config, { hasFactory: () => true }),
		).toEqual([]);
	});

	test("reports missing providers with a config hint", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				providers: {},
			},
			{},
		);

		expect(collectConfigDiagnostics(config)).toEqual(
			expect.arrayContaining([
				{
					message: "No providers are configured.",
					fix: "add providers.<name> to the config file.",
				},
				{
					message: "Default provider is not configured: zhipu",
					fix: "set default_provider to one of the configured providers.",
				},
			]),
		);
	});

	test("reports invalid runtime port values", () => {
		const config = buildConfig(baseRawConfig, {});
		config.server.port = 0;

		expect(collectConfigDiagnostics(config)).toContainEqual({
			message: "Invalid server port: 0",
			fix: "use an integer between 1 and 65535.",
		});
	});

	test("reports missing provider API keys", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				providers: {
					zhipu: {
						spec: "zhipu",
						endpoint: { base_url: "https://example.test/api" },
					},
				},
			},
			{},
		);

		expect(collectConfigDiagnostics(config)).toContainEqual({
			message: "Provider zhipu is missing api_key.",
			fix: "set providers.zhipu.credentials.api_key or reference an environment variable.",
		});
	});

	test("reports unresolved provider environment variables with export hints", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				providers: {
					zhipu: {
						spec: "zhipu",
						credentials: { api_key: "${MISSING_ZHIPU_API_KEY}" },
						endpoint: { base_url: "https://example.test/api" },
					},
				},
			},
			{},
		);

		expect(collectConfigDiagnostics(config)).toContainEqual({
			message:
				"providers.zhipu.credentials.api_key uses unresolved environment variable MISSING_ZHIPU_API_KEY.",
			fix: "export MISSING_ZHIPU_API_KEY=...",
		});
	});

	test("reports unresolved provider base URL environment variables", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				providers: {
					zhipu: {
						spec: "zhipu",
						credentials: { api_key: "secret-key" },
						endpoint: { base_url: "${MISSING_ZHIPU_BASE_URL}" },
					},
				},
			},
			{},
		);

		expect(collectConfigDiagnostics(config)).toContainEqual({
			message:
				"providers.zhipu.endpoint.base_url uses unresolved environment variable MISSING_ZHIPU_BASE_URL.",
			fix: "export MISSING_ZHIPU_BASE_URL=...",
		});
	});

	test("reports providers unsupported by the current build", () => {
		const config = buildConfig(baseRawConfig, {});

		expect(
			collectConfigDiagnostics(config, { hasFactory: () => false }),
		).toContainEqual({
			message: "Provider is configured but not supported by this build: zhipu",
			fix: "remove providers.zhipu or add a provider implementation.",
		});
	});
});

describe("assertConfigReady", () => {
	test("does not throw when config has no diagnostics", () => {
		const config = buildConfig(baseRawConfig, {});

		expect(() =>
			assertConfigReady(config, { hasFactory: () => true }),
		).not.toThrow();
	});

	test("throws all diagnostics in one actionable CLI error", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				default_provider: "missing",
			},
			{},
		);

		expect(() => assertConfigReady(config)).toThrow(
			"Config check failed:\n- Default provider is not configured: missing Fix: set default_provider to one of the configured providers.",
		);
	});
});
