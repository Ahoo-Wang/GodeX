import { createDeepSeekProvider, DEEPSEEK_PROVIDER_NAME } from "./deepseek";
import {
	createProviderDefinition,
	type ProviderDefinition,
} from "./definition";
import { createOpenAIProvider, OPENAI_PROVIDER_NAME } from "./openai";
import { Registrar } from "./registrar";
import { createZhipuProvider, ZHIPU_PROVIDER_NAME } from "./zhipu";

export const OPENAI_PROVIDER_DEFINITION = createProviderDefinition(
	OPENAI_PROVIDER_NAME,
	createOpenAIProvider,
);

export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
	ZHIPU_PROVIDER_NAME,
	createZhipuProvider,
);

export const DEEPSEEK_PROVIDER_DEFINITION = createProviderDefinition(
	DEEPSEEK_PROVIDER_NAME,
	createDeepSeekProvider,
);

export const BUILTIN_PROVIDER_DEFINITIONS = [
	OPENAI_PROVIDER_DEFINITION,
	ZHIPU_PROVIDER_DEFINITION,
	DEEPSEEK_PROVIDER_DEFINITION,
] as const satisfies readonly ProviderDefinition[];

export function createBuiltinRegistrar(): Registrar {
	const registrar = new Registrar();

	registrar.registerDefinitions(BUILTIN_PROVIDER_DEFINITIONS);

	return registrar;
}
