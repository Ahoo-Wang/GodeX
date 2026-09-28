import { describe, expect, test } from "bun:test";
import { parsePort } from "./options";

describe("parsePort", () => {
	test("returns undefined when no CLI port override is provided", () => {
		expect(parsePort(undefined)).toBeUndefined();
	});

	test("parses a valid CLI port override", () => {
		expect(parsePort("3100")).toBe(3100);
	});

	test("rejects non-numeric and out-of-range ports", () => {
		expect(() => parsePort("abc")).toThrow("Invalid port: abc");
		expect(() => parsePort("0")).toThrow("Invalid port: 0");
		expect(() => parsePort("65536")).toThrow("Invalid port: 65536");
	});
});
