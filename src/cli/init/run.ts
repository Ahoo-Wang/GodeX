import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as clack from "@clack/prompts";
import { buildConfigYaml } from "./config-yaml";
import type { InitOptions } from "./model";
import { promptConfigPath, promptInitConfig } from "./prompts";

export async function runInit(opts: InitOptions): Promise<void> {
	const initConfig = await promptInitConfig();
	if (!initConfig) return;

	const configPath = opts.configPath ?? (await promptConfigPath());
	if (!configPath) return;

	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, buildConfigYaml(initConfig), {
		encoding: "utf-8",
		mode: 0o600,
	});
	chmodSync(configPath, 0o600);
	clack.outro(`Created ${resolve(configPath)}`);
}
