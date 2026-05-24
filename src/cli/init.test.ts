import { describe, expect, test } from "bun:test";
import {
	ZHIPU_BASE_URL,
	ZHIPU_CODING_PLAN_BASE_URL,
} from "../providers/zhipu/provider";
import { buildConfigYaml } from "./init";

describe("buildConfigYaml", () => {
	const baseOpts = {
		provider: "zhipu",
		apiKey: "${ZHIPU_API_KEY}",
		baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
		port: "5678",
		sessionBackend: "sqlite" as const,
		logLevel: "info",
	};

	test("uses coding plan base URL when selected", () => {
		const yaml = buildConfigYaml({
			...baseOpts,
			baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
		});
		expect(yaml).toContain(`base_url: ${ZHIPU_CODING_PLAN_BASE_URL}`);
	});

	test("uses standard base URL when selected", () => {
		const yaml = buildConfigYaml({ ...baseOpts, baseUrl: ZHIPU_BASE_URL });
		expect(yaml).toContain(`base_url: ${ZHIPU_BASE_URL}`);
	});

	test("includes sqlite path for sqlite backend", () => {
		const yaml = buildConfigYaml({ ...baseOpts, sessionBackend: "sqlite" });
		expect(yaml).toContain("sqlite:");
		expect(yaml).toContain("path:");
	});

	test("omits sqlite config for memory backend", () => {
		const yaml = buildConfigYaml({ ...baseOpts, sessionBackend: "memory" });
		expect(yaml).not.toContain("sqlite:");
	});
});
