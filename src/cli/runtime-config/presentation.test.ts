import { describe, expect, test } from "bun:test";
import { buildConfig } from "../../config";
import { formatConfigSummary, redactConfig } from "./presentation";

const rawConfig = {
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

describe("formatConfigSummary", () => {
	test("summarizes the runtime config for config check output", () => {
		const config = buildConfig(rawConfig, {});

		expect(formatConfigSummary({ path: "godex.yaml", config })).toBe(
			[
				"Config OK: godex.yaml",
				"server: http://0.0.0.0:3000",
				"default provider: zhipu",
				"providers: zhipu",
				"session: memory",
				"",
			].join("\n"),
		);
	});
});

describe("redactConfig", () => {
	test("redacts provider secrets without mutating the original config", () => {
		const config = buildConfig(rawConfig, {});

		const redacted = redactConfig(config);

		expect(redacted.providers.zhipu?.api_key).toBe("<redacted>");
		expect(config.providers.zhipu?.api_key).toBe("secret-key");
	});
});
