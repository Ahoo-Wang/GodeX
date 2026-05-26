import { describe, expect, test } from "bun:test";
import { ZHIPU_CAPABILITIES } from "./capabilities";

describe("ZHIPU_CAPABILITIES", () => {
	test("declares streaming usage support", () => {
		expect(ZHIPU_CAPABILITIES.streaming.usage).toBe(true);
	});
});
