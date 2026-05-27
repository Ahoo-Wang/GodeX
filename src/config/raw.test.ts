import { describe, expect, test } from "bun:test";
import { asConfigObject } from "./raw";

describe("asConfigObject", () => {
	test("returns objects unchanged", () => {
		const raw = { providers: {} };

		expect(asConfigObject(raw)).toBe(raw);
	});

	test("normalizes arrays to an empty object", () => {
		expect(asConfigObject(["providers"])).toEqual({});
	});
});
