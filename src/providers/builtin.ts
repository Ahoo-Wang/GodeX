import {
	createDeepSeekProviderEdge,
	DEEPSEEK_PROVIDER_NAME,
	DEEPSEEK_PROVIDER_SPEC,
} from "./deepseek";
import {
	createProviderDefinition,
	type ProviderDefinition,
} from "./definition";
import {
	createMiniMaxProviderEdge,
	MINIMAX_PROVIDER_NAME,
	MINIMAX_PROVIDER_SPEC,
} from "./minimax";
import { Registrar } from "./registrar";
import {
	createXiaomiProviderEdge,
	XIAOMI_PROVIDER_NAME,
	XIAOMI_PROVIDER_SPEC,
} from "./xiaomi";
import {
	createZhipuProviderEdge,
	ZHIPU_PROVIDER_NAME,
	ZHIPU_PROVIDER_SPEC,
} from "./zhipu";

export const DEEPSEEK_PROVIDER_DEFINITION = createProviderDefinition(
	DEEPSEEK_PROVIDER_NAME,
	createDeepSeekProviderEdge,
);

export const ZHIPU_PROVIDER_DEFINITION = createProviderDefinition(
	ZHIPU_PROVIDER_NAME,
	createZhipuProviderEdge,
);

export const MINIMAX_PROVIDER_DEFINITION = createProviderDefinition(
	MINIMAX_PROVIDER_NAME,
	createMiniMaxProviderEdge,
);

export const XIAOMI_PROVIDER_DEFINITION = createProviderDefinition(
	XIAOMI_PROVIDER_NAME,
	createXiaomiProviderEdge,
);

export const BUILTIN_PROVIDER_DEFINITIONS = [
	DEEPSEEK_PROVIDER_DEFINITION,
	ZHIPU_PROVIDER_DEFINITION,
	MINIMAX_PROVIDER_DEFINITION,
	XIAOMI_PROVIDER_DEFINITION,
] as const satisfies readonly ProviderDefinition[];

export const BUILTIN_PROVIDER_SPECS = [
	DEEPSEEK_PROVIDER_SPEC,
	ZHIPU_PROVIDER_SPEC,
	MINIMAX_PROVIDER_SPEC,
	XIAOMI_PROVIDER_SPEC,
] as const;

export function createBuiltinRegistrar(): Registrar {
	const registrar = new Registrar();

	registrar.registerDefinitions(BUILTIN_PROVIDER_DEFINITIONS);

	return registrar;
}
