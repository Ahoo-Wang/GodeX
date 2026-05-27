import { describe, expect, test } from "bun:test";
import {
	ModelAliasCatalog,
	ModelResolver,
	parseModelSelector,
	parseProviderModelReference,
} from ".";

describe("resolver barrel exports", () => {
	test("exports resolver building blocks", () => {
		expect(ModelResolver).toBeFunction();
		expect(ModelAliasCatalog).toBeFunction();
		expect(parseModelSelector).toBeFunction();
		expect(parseProviderModelReference).toBeFunction();
	});
});
