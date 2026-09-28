import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
	BEARER_AUTH,
	CHAT_COMPLETIONS_PROTOCOL,
	validateProviderPackageShape,
} from "../bridge/provider-spec";
import { DEFAULT_TOOL_NAME_CODEC } from "../bridge/tools";
import { BUILTIN_PROVIDER_SPECS } from "./builtin";
import { DEEPSEEK_PROVIDER_SPEC } from "./deepseek/spec";
import { ZHIPU_PROVIDER_SPEC } from "./zhipu/spec";

function listProviderFiles(provider: string): string[] {
	const root = join(import.meta.dir, provider);
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const abs = join(dir, entry.name);
			if (entry.isDirectory()) walk(abs);
			else out.push(abs.slice(process.cwd().length + 1));
		}
	};
	walk(root);
	return out;
}

describe("ProviderSpec runtime conformance", () => {
	test("built-in providers use ProviderSpec package shape", () => {
		for (const provider of ["deepseek", "minimax", "zhipu", "xiaomi"]) {
			expect(
				validateProviderPackageShape(provider, listProviderFiles(provider)),
			).toEqual([]);
		}
	});

	test("built-in provider specs include deepseek, zhipu, minimax, and xiaomi with unique names", () => {
		const names = BUILTIN_PROVIDER_SPECS.map((spec) => spec.name);

		expect(names).toEqual(["deepseek", "zhipu", "minimax", "xiaomi"]);
		expect(new Set(names).size).toBe(names.length);
	});

	for (const spec of BUILTIN_PROVIDER_SPECS) {
		test(`${spec.name} spec exposes protocol, capabilities, accessors, and toolName`, () => {
			expect(spec.protocol).toBe(CHAT_COMPLETIONS_PROTOCOL);
			expect(spec.capabilities.parameters.supported.size).toBeGreaterThan(0);
			expect(spec.capabilities.responseFormats.supported.size).toBeGreaterThan(
				0,
			);
			expect(spec.endpoint.defaultBaseURL).toStartWith("https://");
			expect(spec.auth).toBe(BEARER_AUTH);
			expect(spec.toolName.toProviderName("local.shell")).toBeString();
			expect(spec.toolName.fromProviderName("provider_name")).toBe(
				"provider_name",
			);
			expect(spec.response.firstChoice).toBeFunction();
			expect(spec.response.finishReason).toBeFunction();
			expect(spec.response.outputText).toBeFunction();
			expect(spec.response.usage).toBeFunction();
			expect(spec.stream.deltas).toBeFunction();
		});
	}

	test("chat-completions provider specs do not expose OpenAI-native tool_search as a callable function", () => {
		for (const spec of BUILTIN_PROVIDER_SPECS) {
			expect(spec.capabilities.tools.supported.has("tool_search")).toBe(false);
			expect(spec.capabilities.tools.degraded?.has("tool_search")).toBe(false);
		}
	});

	test("chat-completions provider specs do not expose native MCP calls before response reconstruction supports them", () => {
		for (const spec of BUILTIN_PROVIDER_SPECS) {
			expect(spec.capabilities.tools.supported.has("mcp")).toBe(false);
			expect(spec.capabilities.tools.degraded?.has("mcp")).toBe(false);
		}
	});

	test("Zhipu and DeepSeek share the same chat-completions function name codec constraints", () => {
		expect(ZHIPU_PROVIDER_SPEC.toolName).toBe(DEFAULT_TOOL_NAME_CODEC);
		expect(ZHIPU_PROVIDER_SPEC.toolName).toBe(DEEPSEEK_PROVIDER_SPEC.toolName);
		for (const spec of [ZHIPU_PROVIDER_SPEC, DEEPSEEK_PROVIDER_SPEC]) {
			expect(spec.toolName.toProviderName("abc-XYZ_09")).toBe("abc-XYZ_09");
			expect(spec.toolName.toProviderName("")).toBe("tool");
			expect(spec.toolName.toProviderName("x".repeat(65))).toBe("x".repeat(64));
			expect(spec.toolName.toProviderName("weather.now")).toBe("weather_now");
			expect(spec.toolName.toProviderName("weather.now")).toMatch(
				/^[a-zA-Z0-9_-]{1,64}$/,
			);
		}
	});
});
