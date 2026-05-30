import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

	if (existsSync(configPath)) {
		const overwrite = await clack.confirm({
			message: `${resolve(configPath)} already exists. Overwrite?`,
			initialValue: false,
		});
		if (clack.isCancel(overwrite) || !overwrite) {
			clack.cancel("Operation cancelled");
			return;
		}
	}

	const yamlContent = buildConfigYaml(initConfig);

	clack.note(yamlContent, "Preview");

	const confirm = await clack.confirm({
		message: "Write this configuration?",
		initialValue: true,
	});
	if (clack.isCancel(confirm) || !confirm) {
		clack.cancel("Operation cancelled");
		return;
	}

	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, yamlContent, {
		encoding: "utf-8",
		mode: 0o600,
	});
	chmodSync(configPath, 0o600);
	clack.outro(`Created ${resolve(configPath)}`);
}
