import {
	createDeepSeekProviderEdge,
	DEEPSEEK_PROVIDER_NAME,
	DEEPSEEK_PROVIDER_SPEC,
} from "./deepseek";
import {
	createProviderDefinition,
	type ProviderDefinition,
} from "./definition";
import { EXAMPLE_PROVIDER_SPEC } from "./example";
import { Registrar } from "./registrar";
import {
	createZhipuProviderEdge,
	ZHIPU_PROVIDER_NAME,
	ZHIPU_PROVIDER_SPEC,
} from "./zhipu";

export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
	ZHIPU_PROVIDER_NAME,
	createZhipuProviderEdge,
);

export const DEEPSEEK_PROVIDER_DEFINITION = createProviderDefinition(
	DEEPSEEK_PROVIDER_NAME,
	createDeepSeekProviderEdge,
);

export const BUILTIN_PROVIDER_DEFINITIONS = [
	ZHIPU_PROVIDER_DEFINITION,
	DEEPSEEK_PROVIDER_DEFINITION,
] as const satisfies readonly ProviderDefinition[];

export const BUILTIN_PROVIDER_SPECS = [
	EXAMPLE_PROVIDER_SPEC,
	ZHIPU_PROVIDER_SPEC,
	DEEPSEEK_PROVIDER_SPEC,
] as const;

export const BUILTIN_PROVIDER_SPEC_DEFINITIONS = BUILTIN_PROVIDER_SPECS;

export function createBuiltinRegistrar(): Registrar {
	const registrar = new Registrar();

	registrar.registerDefinitions(BUILTIN_PROVIDER_DEFINITIONS);

	return registrar;
}
