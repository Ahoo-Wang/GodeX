import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";
import { createOpenAIProvider } from "./openai";
import { createZhipuProvider } from "./zhipu";
import { Registrar } from "./registrar";

export function createBuiltinRegistrar(): Registrar {
	const registrar = new Registrar();

	registrar.registerFactory(
		"openai",
		(config: ProviderConfig) =>
			createOpenAIProvider(config) as Provider<unknown, unknown, unknown>,
	);

	registrar.registerFactory(
		"zhipu",
		(config: ProviderConfig) =>
			createZhipuProvider(config) as Provider<unknown, unknown, unknown>,
	);

	return registrar;
}
