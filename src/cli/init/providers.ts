import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";

export type InitProviderId =
	| typeof DEEPSEEK_PROVIDER_NAME
	| typeof ZHIPU_PROVIDER_NAME;

export interface InitProviderBaseUrlChoice {
	value: string;
	label: string;
	hint: string;
}

export interface InitProviderDefinition {
	id: InitProviderId;
	label: string;
	apiKeyPlaceholder: string;
	baseUrlChoices: InitProviderBaseUrlChoice[];
	defaultBaseUrl: string;
}

export const INIT_PROVIDER_DEFINITIONS: InitProviderDefinition[] = [
	{
		id: DEEPSEEK_PROVIDER_NAME,
		label: "DeepSeek",
		apiKeyPlaceholder: "${DEEPSEEK_API_KEY}",
		baseUrlChoices: [
			{
				value: DEFAULT_DEEPSEEK_BASE_URL,
				label: "Standard",
				hint: DEFAULT_DEEPSEEK_BASE_URL,
			},
		],
		defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
	},
	{
		id: ZHIPU_PROVIDER_NAME,
		label: "Zhipu (智谱)",
		apiKeyPlaceholder: "${ZHIPU_API_KEY}",
		baseUrlChoices: [
			{
				value: ZHIPU_CODING_PLAN_BASE_URL,
				label: "Coding Plan (Recommended)",
				hint: ZHIPU_CODING_PLAN_BASE_URL,
			},
			{
				value: ZHIPU_BASE_URL,
				label: "Standard",
				hint: ZHIPU_BASE_URL,
			},
		],
		defaultBaseUrl: ZHIPU_CODING_PLAN_BASE_URL,
	},
];

export function getInitProviderDefinition(
	id: string,
): InitProviderDefinition | undefined {
	return INIT_PROVIDER_DEFINITIONS.find((provider) => provider.id === id);
}
