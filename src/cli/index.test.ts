import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isDevMode } from "../config";
import type { ServerDeps } from "../server";
import { runCli } from ".";

const { version } = require("../../package.json");

const validConfig = {
	server: { port: 3000 },
	default_provider: "zhipu",
	providers: {
		zhipu: {
			api_key: "secret-key",
			base_url: "https://example.test/api",
			models: { "gpt-5": "glm-5.1" },
		},
	},
	session: { backend: "memory" },
	logging: { level: "error" },
};

function cliHarness(files: Record<string, Record<string, unknown> | null>) {
	const stdout: string[] = [];
	const stderr: string[] = [];
	const starts: ServerDeps[] = [];

	return {
		stdout,
		stderr,
		starts,
		run(args: string[]) {
			return runCli(["bun", "godex", ...args], {
				stdout: { write: (message) => stdout.push(String(message)) },
				stderr: { write: (message) => stderr.push(String(message)) },
				loadConfigFromFile: (path) => files[path] ?? null,
				startServer: (deps) => {
					starts.push(deps);
					return { port: deps.config.server.port };
				},
			});
		},
	};
}

describe("CLI", () => {
	test("starts the server from the root command", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run(["--port", "3100"]);

		expect(code).toBe(0);
		expect(cli.starts).toHaveLength(1);
		expect(cli.starts[0]?.config.server.port).toBe(3100);
		expect(cli.stdout.join("")).toContain(
			`Godex v${version} [${isDevMode() ? "dev" : "prod"}] listening on http://0.0.0.0:3100`,
		);
	});

	test("starts the server from the explicit serve command", async () => {
		const cli = cliHarness({ "custom.yaml": validConfig });

		const code = await cli.run(["serve", "--config", "custom.yaml"]);

		expect(code).toBe(0);
		expect(cli.starts).toHaveLength(1);
		expect(cli.starts[0]?.config.default_provider).toBe("zhipu");
	});

	test("prints help from the commander help command", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run(["help", "serve"]);

		expect(code).toBe(0);
		expect(cli.stdout.join("")).toContain("Usage: godex serve [options]");
		expect(cli.stderr.join("")).toBe("");
	});

	test("prints the configured host when starting the server", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run([
			"serve",
			"--host",
			"0.0.0.0",
			"--port",
			"3101",
		]);

		expect(code).toBe(0);
		expect(cli.starts[0]?.config.server.host).toBe("0.0.0.0");
		expect(cli.stdout.join("")).toContain(
			`Godex v${version} [${isDevMode() ? "dev" : "prod"}] listening on http://0.0.0.0:3101`,
		);
	});

	test("rejects invalid ports before starting the server", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run(["serve", "--port", "abc"]);

		expect(code).toBe(1);
		expect(cli.starts).toHaveLength(0);
		expect(cli.stderr.join("")).toContain("Invalid port: abc");
	});

	test("checks a usable config", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run(["config", "check"]);

		expect(code).toBe(0);
		const output = cli.stdout.join("");
		expect(output).toContain("Config OK: godex.yaml");
		expect(output).toContain("server: http://0.0.0.0:3000");
		expect(output).toContain("default provider: zhipu");
		expect(output).toContain("session: memory");
	});

	test("reports missing config files with a fix", async () => {
		const cli = cliHarness({});

		const code = await cli.run(["config", "check", "--config", "missing.yaml"]);

		expect(code).toBe(1);
		const error = cli.stderr.join("");
		expect(error).toContain("Config file not found: missing.yaml");
		expect(error).toContain("Fix: pass --config <path>");
	});

	test("reports unresolved provider API key environment variables", async () => {
		const cli = cliHarness({
			"godex.yaml": {
				...validConfig,
				providers: {
					zhipu: {
						api_key: "${MISSING_ZHIPU_API_KEY}",
						base_url: "https://example.test/api",
					},
				},
			},
		});

		const code = await cli.run(["config", "check"]);

		expect(code).toBe(1);
		const error = cli.stderr.join("");
		expect(error).toContain("MISSING_ZHIPU_API_KEY");
		expect(error).toContain("export MISSING_ZHIPU_API_KEY=");
	});

	test("prints final config with provider secrets redacted", async () => {
		const cli = cliHarness({ "godex.yaml": validConfig });

		const code = await cli.run(["config", "print"]);

		expect(code).toBe(0);
		const printed = JSON.parse(cli.stdout.join("")) as typeof validConfig;
		expect(printed.providers.zhipu.api_key).toBe("<redacted>");
		expect(cli.stdout.join("")).not.toContain("secret-key");
	});

	test("compiled binary can print the package version", async () => {
		const packageJson = (await Bun.file("package.json").json()) as {
			version: string;
		};
		const tempDir = mkdtempSync(join(tmpdir(), "godex-cli-"));
		const outfile = join(tempDir, "godex");

		try {
			const build = Bun.spawnSync([
				"bun",
				"build",
				"--compile",
				"src/index.ts",
				"--outfile",
				outfile,
			]);
			expect(build.exitCode).toBe(0);

			const version = Bun.spawnSync([outfile, "--version"]);

			expect(version.exitCode).toBe(0);
			expect(new TextDecoder().decode(version.stdout).trim()).toBe(
				packageJson.version,
			);
			expect(new TextDecoder().decode(version.stderr)).toBe("");
		} finally {
			rmSync(tempDir, { recursive: true, force: true });
		}
	});
});
