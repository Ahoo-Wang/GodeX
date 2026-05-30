import { describe, expect, test } from "bun:test";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	DEFAULT_MINIMAX_BASE_URL,
	MINIMAX_PROVIDER_NAME,
} from "../../providers/minimax";
import {
	DEFAULT_XIAOMI_BASE_URL,
	XIAOMI_PROVIDER_NAME,
} from "../../providers/xiaomi";
import {
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";
import {
	getInitProviderDefinition,
	INIT_PROVIDER_DEFINITIONS,
} from "./providers";

describe("INIT_PROVIDER_DEFINITIONS", () => {
	test("includes only bridge providers in wizard order", () => {
		expect(INIT_PROVIDER_DEFINITIONS.map((provider) => provider.id)).toEqual([
			DEEPSEEK_PROVIDER_NAME,
			ZHIPU_PROVIDER_NAME,
			MINIMAX_PROVIDER_NAME,
			XIAOMI_PROVIDER_NAME,
		]);
	});

	test("defines provider-specific API key placeholders and default base URLs", () => {
		expect(getInitProviderDefinition("openai")).toBeUndefined();
		expect(getInitProviderDefinition("deepseek")).toMatchObject({
			apiKeyPlaceholder: "${DEEPSEEK_API_KEY}",
			defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
			defaultModel: "deepseek-v4-pro",
		});
		expect(getInitProviderDefinition("minimax")).toMatchObject({
			apiKeyPlaceholder: "${MINIMAX_API_KEY}",
			defaultBaseUrl: DEFAULT_MINIMAX_BASE_URL,
			defaultModel: "MiniMax-M2.7",
		});
		expect(getInitProviderDefinition("zhipu")).toMatchObject({
			apiKeyPlaceholder: "${ZHIPU_API_KEY}",
			defaultBaseUrl: ZHIPU_CODING_PLAN_BASE_URL,
			defaultModel: "glm-5.1",
		});
		expect(getInitProviderDefinition("xiaomi")).toMatchObject({
			apiKeyPlaceholder: "${MIMO_API_KEY}",
			defaultBaseUrl: DEFAULT_XIAOMI_BASE_URL,
			defaultModel: "mimo-v2.5-pro",
		});
	});
});
