import { describe, expect, test } from "bun:test";
import { createBuiltinRegistrar } from "./builtin";
import { DEEPSEEK_PROVIDER_NAME } from "./deepseek";
import { OPENAI_PROVIDER_NAME } from "./openai";
import { ZHIPU_PROVIDER_NAME } from "./zhipu";

describe("createBuiltinRegistrar", () => {
	test("registers built-in provider factories", () => {
		const registrar = createBuiltinRegistrar();

		registrar.registerProviders({
			[OPENAI_PROVIDER_NAME]: {
				api_key: "openai-key",
				base_url: "https://openai.example.test",
			},
			[ZHIPU_PROVIDER_NAME]: {
				api_key: "zhipu-key",
				base_url: "https://zhipu.example.test",
			},
			[DEEPSEEK_PROVIDER_NAME]: {
				api_key: "deepseek-key",
				base_url: "https://deepseek.example.test",
			},
		});

		expect(registrar.list()).toEqual([
			OPENAI_PROVIDER_NAME,
			ZHIPU_PROVIDER_NAME,
			DEEPSEEK_PROVIDER_NAME,
		]);
		expect(registrar.resolve(DEEPSEEK_PROVIDER_NAME).name).toBe(
			DEEPSEEK_PROVIDER_NAME,
		);
	});
});
