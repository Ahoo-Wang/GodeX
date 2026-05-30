import { describe, expect, test } from "bun:test";
import { createBuiltinRegistrar } from "./builtin";
import { DEEPSEEK_PROVIDER_NAME } from "./deepseek";
import { MINIMAX_PROVIDER_NAME } from "./minimax";
import { ZHIPU_PROVIDER_NAME } from "./zhipu";

describe("createBuiltinRegistrar", () => {
	test("registers only non-native Responses bridge provider factories", () => {
		const registrar = createBuiltinRegistrar();

		registrar.registerProviders({
			[DEEPSEEK_PROVIDER_NAME]: {
				spec: DEEPSEEK_PROVIDER_NAME,
				credentials: { api_key: "deepseek-key" },
				endpoint: { base_url: "https://deepseek.example.test" },
			},
			[MINIMAX_PROVIDER_NAME]: {
				spec: MINIMAX_PROVIDER_NAME,
				credentials: { api_key: "minimax-key" },
				endpoint: { base_url: "https://minimax.example.test" },
			},
			[ZHIPU_PROVIDER_NAME]: {
				spec: ZHIPU_PROVIDER_NAME,
				credentials: { api_key: "zhipu-key" },
				endpoint: { base_url: "https://zhipu.example.test" },
			},
		});

		expect(registrar.list()).toEqual([
			DEEPSEEK_PROVIDER_NAME,
			MINIMAX_PROVIDER_NAME,
			ZHIPU_PROVIDER_NAME,
		]);
		expect(registrar.resolve(DEEPSEEK_PROVIDER_NAME).name).toBe(
			DEEPSEEK_PROVIDER_NAME,
		);
	});
});
