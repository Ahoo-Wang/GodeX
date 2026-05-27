import type { GodeXConfig } from "../config";
import type { Logger } from "../logger";
import { createBuiltinRegistrar } from "../providers/builtin";
import type { Registrar } from "../providers/registrar";

export function createConfiguredRegistrar(
	providers: GodeXConfig["providers"],
	logger: Logger,
	registrar?: Registrar,
): Registrar {
	const configuredRegistrar = registrar ?? createBuiltinRegistrar();
	configuredRegistrar.registerProviders(providers, logger);
	return configuredRegistrar;
}
