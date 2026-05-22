// src/config/index.test.ts
import { describe, expect, test } from "bun:test";
import { buildConfig, resolveEnvVars } from ".";

describe("resolveEnvVars", () => {
	test("replaces ${VAR} with environment value", () => {
		process.env.TEST_KEY = "secret123";
		expect(resolveEnvVars("Bearer ${TEST_KEY}")).toBe("Bearer secret123");
		delete process.env.TEST_KEY;
	});

	test("leaves unresolved vars as-is", () => {
		expect(resolveEnvVars("${MISSING_VAR}")).toBe("${MISSING_VAR}");
	});

	test("handles string without variables", () => {
		expect(resolveEnvVars("plain-text")).toBe("plain-text");
	});

	test("replaces multiple vars in one string", () => {
		process.env.HOST = "example.com";
		process.env.PORT = "8080";
		expect(resolveEnvVars("${HOST}:${PORT}")).toBe("example.com:8080");
		delete process.env.HOST;
		delete process.env.PORT;
	});
});

describe("buildConfig", () => {
	const validFileConfig = {
		providers: {
			zhipu: {
				api_key: "test-key",
				base_url: "https://example.test/api",
			},
		},
	};

	test("throws for providers without base_url", () => {
		expect(() =>
			buildConfig(
				{
					providers: {
						zhipu: { api_key: "test-key" },
					},
				},
				{},
			),
		).toThrow("Provider zhipu is missing required field: base_url");
	});

	test("throws for provider entries that are not objects", () => {
		expect(() =>
			buildConfig(
				{
					providers: {
						zhipu: "https://example.test/api",
					},
				},
				{},
			),
		).toThrow("Provider zhipu must be an object");
	});

	test("throws for invalid log level", () => {
		expect(() => buildConfig({ logging: { level: "verbose" } }, {})).toThrow(
			"Invalid log level: verbose",
		);
	});

	test("throws for invalid console log level", () => {
		expect(() =>
			buildConfig(
				{
					...validFileConfig,
					logging: {
						level: "info",
						console: { enabled: true, level: "verbose" },
					},
				},
				{},
			),
		).toThrow("Invalid console log level: verbose");
	});

	test("throws for invalid file log level", () => {
		expect(() =>
			buildConfig(
				{
					...validFileConfig,
					logging: {
						level: "info",
						file: {
							enabled: true,
							level: "verbose",
							dir: "/var/log/godex",
							filename: "godex.log",
						},
					},
				},
				{},
			),
		).toThrow("Invalid file log level: verbose");
	});

	test("throws when file logging is enabled without a directory", () => {
		expect(() =>
			buildConfig(
				{
					...validFileConfig,
					logging: {
						level: "info",
						file: { enabled: true, filename: "godex.log" },
					},
				},
				{},
			),
		).toThrow("logging.file.dir is required when file logging is enabled");
	});

	test("throws when file logging is enabled without a filename", () => {
		expect(() =>
			buildConfig(
				{
					...validFileConfig,
					logging: {
						level: "info",
						file: { enabled: true, dir: "/var/log/godex" },
					},
				},
				{},
			),
		).toThrow("logging.file.filename is required when file logging is enabled");
	});

	test("throws for invalid session backend", () => {
		expect(() => buildConfig({ session: { backend: "redis" } }, {})).toThrow(
			"Invalid session backend: redis",
		);
	});

	test("throws for invalid GODEX_PORT", () => {
		process.env.GODEX_PORT = "abc";
		try {
			expect(() => buildConfig(validFileConfig, {})).toThrow(
				"Invalid server port: abc",
			);
		} finally {
			delete process.env.GODEX_PORT;
		}
	});

	test("throws for empty server host", () => {
		expect(() =>
			buildConfig(
				{
					...validFileConfig,
					server: { host: "" },
				},
				{},
			),
		).toThrow("Invalid server host");
	});

	test("throws for provider model mappings with non-string targets", () => {
		expect(() =>
			buildConfig(
				{
					providers: {
						zhipu: {
							api_key: "test-key",
							base_url: "https://example.test/api",
							models: { "gpt-5": 51 },
						},
					},
				},
				{},
			),
		).toThrow("Provider zhipu models.gpt-5 must be a string");
	});

	test("parses logging config with console and file", () => {
		const config = buildConfig(
			{
				providers: {
					zhipu: { api_key: "test-key", base_url: "https://example.test/api" },
				},
				logging: {
					level: "debug",
					console: { enabled: true, level: "info" },
					file: {
						enabled: true,
						level: "warn",
						dir: "/var/log/godex",
						filename: "godex.log",
					},
				},
			},
			{},
		);
		expect(config.logging.level).toBe("debug");
		expect(config.logging.console).toEqual({
			enabled: true,
			level: "info",
		});
		expect(config.logging.file).toEqual({
			enabled: true,
			level: "warn",
			dir: "/var/log/godex",
			filename: "godex.log",
		});
	});

	test("logging console and file default to undefined when not set", () => {
		const config = buildConfig(
			{
				providers: {
					zhipu: { api_key: "test-key", base_url: "https://example.test/api" },
				},
			},
			{},
		);
		expect(config.logging.level).toBe("info");
		expect(config.logging.console).toBeUndefined();
		expect(config.logging.file).toBeUndefined();
	});
});
