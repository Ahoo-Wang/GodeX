import type { Provider } from "../adapter/provider";
import type { ProviderConfig } from "../config";
import { createOpenAIProvider, OPENAI_PROVIDER_NAME } from "./openai";
import { Registrar } from "./registrar";
import { createZhipuProvider, ZHIPU_PROVIDER_NAME } from "./zhipu";

export function createBuiltinRegistrar(): Registrar {
	const registrar = new Registrar();

	registrar.registerFactory(
		OPENAI_PROVIDER_NAME,
		(config: ProviderConfig) =>
			createOpenAIProvider(config) as Provider<unknown, unknown, unknown>,
	);

	registrar.registerFactory(
		ZHIPU_PROVIDER_NAME,
		(config: ProviderConfig) =>
			createZhipuProvider(config) as Provider<unknown, unknown, unknown>,
	);

	return registrar;
}
