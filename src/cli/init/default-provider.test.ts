import { describe, expect, test } from "bun:test";
import { DEEPSEEK_PROVIDER_NAME } from "../../providers/deepseek/provider";
import { OPENAI_PROVIDER_NAME } from "../../providers/openai/provider";
import { ZHIPU_PROVIDER_NAME } from "../../providers/zhipu/provider";
import { resolveDefaultProvider } from "./default-provider";

describe("resolveDefaultProvider", () => {
	test("rejects empty provider selections", () => {
		expect(() => resolveDefaultProvider([], undefined)).toThrow(
			"At least one provider must be configured",
		);
	});

	test("uses the only configured provider without prompting", () => {
		expect(resolveDefaultProvider([DEEPSEEK_PROVIDER_NAME], undefined)).toBe(
			DEEPSEEK_PROVIDER_NAME,
		);
	});

	test("uses selected default when multiple providers are configured", () => {
		expect(
			resolveDefaultProvider(
				[DEEPSEEK_PROVIDER_NAME, OPENAI_PROVIDER_NAME],
				OPENAI_PROVIDER_NAME,
			),
		).toBe(OPENAI_PROVIDER_NAME);
	});

	test("rejects a selected default that is not configured", () => {
		expect(() =>
			resolveDefaultProvider(
				[DEEPSEEK_PROVIDER_NAME, OPENAI_PROVIDER_NAME],
				ZHIPU_PROVIDER_NAME,
			),
		).toThrow('Default provider "zhipu" is not configured');
	});
});
