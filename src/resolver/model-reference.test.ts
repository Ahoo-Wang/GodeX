import { describe, expect, test } from "bun:test";
import { parseProviderModelReference } from "./model-reference";

describe("parseProviderModelReference", () => {
	test("parses provider and model segments at the first separator", () => {
		expect(parseProviderModelReference("zhipu/glm-5.1")).toEqual({
			provider: "zhipu",
			model: "glm-5.1",
		});
	});

	test("allows additional separators inside the model segment", () => {
		expect(parseProviderModelReference("openai/fine_tuned/gpt-4.1")).toEqual({
			provider: "openai",
			model: "fine_tuned/gpt-4.1",
		});
	});

	test("returns undefined when provider or model segment is empty", () => {
		expect(parseProviderModelReference("/glm-5.1")).toBeUndefined();
		expect(parseProviderModelReference("zhipu/")).toBeUndefined();
		expect(parseProviderModelReference("zhipu")).toBeUndefined();
	});
});
