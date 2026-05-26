import { chmodSync, writeFileSync } from "node:fs";
import * as clack from "@clack/prompts";
import { buildConfigYaml } from "./config-yaml";
import type { InitOptions } from "./model";
import { promptInitConfig } from "./prompts";

export async function runInit(opts: InitOptions): Promise<void> {
	const initConfig = await promptInitConfig();
	if (!initConfig) return;

	writeFileSync(opts.configPath, buildConfigYaml(initConfig), {
		encoding: "utf-8",
		mode: 0o600,
	});
	chmodSync(opts.configPath, 0o600);
	clack.outro(`Created ${opts.configPath}`);
}
