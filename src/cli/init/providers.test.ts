import { describe, expect, test } from "bun:test";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	ZHIPU_BASE_URL,
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
		]);
	});

	test("defines provider-specific API key placeholders and base URLs", () => {
		expect(getInitProviderDefinition("openai")).toBeUndefined();
		expect(getInitProviderDefinition("deepseek")).toMatchObject({
			apiKeyPlaceholder: "${DEEPSEEK_API_KEY}",
			defaultBaseUrl: DEFAULT_DEEPSEEK_BASE_URL,
		});
		expect(
			getInitProviderDefinition("zhipu")?.baseUrlChoices.map(
				(choice) => choice.value,
			),
		).toEqual([ZHIPU_CODING_PLAN_BASE_URL, ZHIPU_BASE_URL]);
	});
});
