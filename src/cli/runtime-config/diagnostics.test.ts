import { describe, expect, test } from "bun:test";
import { buildConfig } from "../../config";
import { assertConfigReady, collectConfigDiagnostics } from "./diagnostics";

const baseRawConfig = {
	server: { port: 3000 },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "secret-key",
			base_url: "https://example.test/api",
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

describe("collectConfigDiagnostics", () => {
	test("reports unresolved provider environment variables with export hints", () => {
		const config = buildConfig(
			{
				...baseRawConfig,
				providers: {
					zhipu: {
						api_key: "${MISSING_ZHIPU_API_KEY}",
						base_url: "https://example.test/api",
					},
				},
			},
			{},
		);

		expect(collectConfigDiagnostics(config)).toContainEqual({
			message:
				"providers.zhipu.api_key uses unresolved environment variable MISSING_ZHIPU_API_KEY.",
			fix: "export MISSING_ZHIPU_API_KEY=...",
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
