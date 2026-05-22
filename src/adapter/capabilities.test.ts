import { describe, expect, test } from "bun:test";
import {
	checkCapability,
	DEFAULT_CAPABILITIES,
	mergeCapabilities,
} from "./capabilities";

function addAtRuntime(set: ReadonlySet<string>, value: string): void {
	try {
		(set as Set<string>).add(value);
	} finally {
		(set as { delete?: (item: string) => boolean }).delete?.(value);
	}
}

function setCapabilityAtRuntime(
	capabilities: typeof DEFAULT_CAPABILITIES,
	key: "maxTools" | "streaming",
	value: number | boolean,
): void {
	(capabilities as unknown as Record<string, unknown>)[key] = value;
}

describe("mergeCapabilities", () => {
	test("copies set capabilities from defaults", () => {
		const first = mergeCapabilities();
		const second = mergeCapabilities();

		expect(first.supportedToolTypes).not.toBe(
			DEFAULT_CAPABILITIES.supportedToolTypes,
		);
		expect(first.features).not.toBe(DEFAULT_CAPABILITIES.features);
		expect(second.supportedToolTypes).not.toBe(first.supportedToolTypes);
		expect(second.features).not.toBe(first.features);
		expect(second.supportedToolTypes.has("custom")).toBe(false);
		expect(second.features.has("vision")).toBe(false);
		expect(DEFAULT_CAPABILITIES.supportedToolTypes.has("custom")).toBe(false);
		expect(DEFAULT_CAPABILITIES.features.has("vision")).toBe(false);
	});

	test("copies set capabilities from overrides", () => {
		const supportedToolTypes = new Set(["function"]);
		const features = new Set(["vision"]);
		const capabilities = mergeCapabilities({ supportedToolTypes, features });

		supportedToolTypes.add("custom");
		features.add("audio");

		expect(capabilities.supportedToolTypes.has("custom")).toBe(false);
		expect(capabilities.features.has("audio")).toBe(false);
		expect(capabilities.supportedToolTypes).not.toBe(supportedToolTypes);
		expect(capabilities.features).not.toBe(features);
	});

	test("produces immutable sets at runtime", () => {
		const capabilities = mergeCapabilities({
			supportedToolTypes: new Set(["function", "file_search"]),
			features: new Set(["vision"]),
		});

		expect(() =>
			addAtRuntime(DEFAULT_CAPABILITIES.supportedToolTypes, "custom"),
		).toThrow();
		expect(() =>
			addAtRuntime(DEFAULT_CAPABILITIES.features, "vision"),
		).toThrow();
		expect(() =>
			addAtRuntime(capabilities.supportedToolTypes, "custom"),
		).toThrow();
		expect(() => addAtRuntime(capabilities.features, "audio")).toThrow();
		expect(capabilities.supportedToolTypes.has("file_search")).toBe(true);
	});

	test("produces immutable scalar fields at runtime", () => {
		const capabilities = mergeCapabilities({ maxTools: 3 });

		expect(() =>
			setCapabilityAtRuntime(DEFAULT_CAPABILITIES, "maxTools", 0),
		).toThrow();
		expect(() =>
			setCapabilityAtRuntime(capabilities, "streaming", false),
		).toThrow();
		expect(DEFAULT_CAPABILITIES.maxTools).toBe(-1);
		expect(capabilities.streaming).toBe(true);
		expect(capabilities.maxTools).toBe(3);
	});
});

describe("checkCapability", () => {
	test("recognizes readonly set capabilities", () => {
		const capabilities = mergeCapabilities({
			supportedToolTypes: new Set(["function"]),
			features: new Set(["vision"]),
		});

		expect(checkCapability(capabilities, "supportedToolTypes")).toEqual({
			supported: true,
		});
		expect(checkCapability(capabilities, "features")).toEqual({
			supported: true,
		});
	});
});
