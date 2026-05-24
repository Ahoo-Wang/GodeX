import { writeFileSync } from "node:fs";
import * as clack from "@clack/prompts";
import { resolveDefaultSqlitePath } from "../config";
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
} from "../providers/zhipu/provider";
import { GODEX_BRAND_NAME } from "../version";

interface InitOptions {
	configPath: string;
}

export async function runInit(opts: InitOptions): Promise<void> {
	clack.intro(`${GODEX_BRAND_NAME} Configuration Wizard`);

	const provider = await clack.select({
		message: "Which LLM provider?",
		options: [{ value: "zhipu", label: "Zhipu (智谱)" }],
	});

	if (clack.isCancel(provider)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const apiKey = await clack.text({
		message: "API Key (or env var like ${ZHIPU_API_KEY}):",
		placeholder: "${ZHIPU_API_KEY}",
	});

	if (clack.isCancel(apiKey)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const baseUrl = await clack.select({
		message: "Base URL:",
		options: [
			{
				value: ZHIPU_CODING_PLAN_BASE_URL,
				label: "Coding Plan (Recommended)",
				hint: ZHIPU_CODING_PLAN_BASE_URL,
			},
			{
				value: ZHIPU_BASE_URL,
				label: "Standard",
				hint: ZHIPU_BASE_URL,
			},
		],
		initialValue: ZHIPU_CODING_PLAN_BASE_URL,
	});

	if (clack.isCancel(baseUrl)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const port = await clack.text({
		message: "Server port:",
		placeholder: "5678",
		defaultValue: "5678",
	});

	if (clack.isCancel(port)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const sessionBackend = await clack.select({
		message: "Session backend:",
		options: [
			{ value: "sqlite", label: "SQLite" },
			{ value: "memory", label: "In-memory" },
		],
	});

	if (clack.isCancel(sessionBackend)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const logLevel = await clack.select({
		message: "Log level:",
		options: [
			{ value: "debug", label: "debug" },
			{ value: "info", label: "info" },
			{ value: "warn", label: "warn" },
		],
		initialValue: "info",
	});

	if (clack.isCancel(logLevel)) {
		clack.cancel("Operation cancelled");
		return;
	}

	const yaml = buildConfigYaml({
		provider: provider as string,
		apiKey: apiKey as string,
		baseUrl: baseUrl as string,
		port: port as string,
		sessionBackend: sessionBackend as string,
		logLevel: logLevel as string,
	});

	writeFileSync(opts.configPath, yaml, "utf-8");
	clack.outro(`Created ${opts.configPath}`);
}

export function buildConfigYaml(opts: {
	provider: string;
	apiKey: string;
	baseUrl: string;
	port: string;
	sessionBackend: string;
	logLevel: string;
}): string {
	const lines = [
		"server:",
		`  port: ${opts.port}`,
		"",
		`default_provider: ${opts.provider}`,
		"",
		"providers:",
		`  ${opts.provider}:`,
		`    api_key: ${opts.apiKey}`,
		`    base_url: ${opts.baseUrl}`,
		"",
		"session:",
		`  backend: ${opts.sessionBackend}`,
	];

	if (opts.sessionBackend === "sqlite") {
		lines.push("  sqlite:");
		lines.push(`    path: ${resolveDefaultSqlitePath()}`);
	}

	lines.push("", "logging:", `  level: ${opts.logLevel}`, "");

	return lines.join("\n");
}
