import {
	DEEPSEEK_DEFAULT_MODEL,
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	DEFAULT_MINIMAX_BASE_URL,
	MINIMAX_DEFAULT_MODEL,
	MINIMAX_PROVIDER_NAME,
} from "../../providers/minimax";
import {
	DEFAULT_XIAOMI_BASE_URL,
	XIAOMI_DEFAULT_MODEL,
	XIAOMI_PROVIDER_NAME,
} from "../../providers/xiaomi";
import {
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_DEFAULT_MODEL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";

export type InitProviderId =
	| typeof DEEPSEEK_PROVIDER_NAME
	| typeof MINIMAX_PROVIDER_NAME
	| typeof XIAOMI_PROVIDER_NAME
	| typeof ZHIPU_PROVIDER_NAME;

export interface InitProviderDefinition {
	id: InitProviderId;
	label: string;
	apiKeyPlaceholder: string;
	defaultBaseUrl: string;
	defaultModel: string;
}

export const INIT_PROVIDER_DEFINITIONS: InitProviderDefinition[] = [
	{
		id: DEEPSEEK_PROVIDER_NAME,
		label: "DeepSeek",
		apiKeyPlaceholder: "${DEEPSEEK_API_KEY}",
		defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
		defaultModel: DEEPSEEK_DEFAULT_MODEL,
	},
	{
		id: ZHIPU_PROVIDER_NAME,
		label: "Zhipu (智谱)",
		apiKeyPlaceholder: "${ZHIPU_API_KEY}",
		defaultBaseUrl: ZHIPU_CODING_PLAN_BASE_URL,
		defaultModel: ZHIPU_DEFAULT_MODEL,
	},
	{
		id: MINIMAX_PROVIDER_NAME,
		label: "MiniMax",
		apiKeyPlaceholder: "${MINIMAX_API_KEY}",
		defaultBaseUrl: DEFAULT_MINIMAX_BASE_URL,
		defaultModel: MINIMAX_DEFAULT_MODEL,
	},
	{
		id: XIAOMI_PROVIDER_NAME,
		label: "Xiaomi (小米)",
		apiKeyPlaceholder: "${MIMO_API_KEY}",
		defaultBaseUrl: DEFAULT_XIAOMI_BASE_URL,
		defaultModel: XIAOMI_DEFAULT_MODEL,
	},
];

export function getInitProviderDefinition(
	id: string,
): InitProviderDefinition | undefined {
	return INIT_PROVIDER_DEFINITIONS.find((provider) => provider.id === id);
}
