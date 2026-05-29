import { describe, expect, test } from "bun:test";
import { BUILTIN_PROVIDER_DEFINITIONS } from "./builtin";

function providerConfigFor(name: string) {
	return {
		spec: name,
		credentials: { api_key: `${name}-key` },
		endpoint: { base_url: `https://${name}.example.test` },
	};
}

describe("provider definitions", () => {
	test("built-in provider definitions have unique names", () => {
		const names = BUILTIN_PROVIDER_DEFINITIONS.map(
			(definition) => definition.name,
		);

		expect(new Set(names).size).toBe(names.length);
	});

	test("built-in provider definitions create matching provider contracts", () => {
		for (const definition of BUILTIN_PROVIDER_DEFINITIONS) {
			const provider = definition.create(providerConfigFor(definition.name));

			expect(provider.name).toBe(definition.name);
			expect(Object.getPrototypeOf(provider)).toBe(Object.prototype);
			expect(provider.spec.name).toBe(definition.name);
			expect(provider.request).toBeFunction();
			expect(provider.stream).toBeFunction();
		}
	});
});
