import { describe, expect, test } from "bun:test";
import { Env, EnvVars } from "./env";

describe("EnvVars", () => {
	test("current returns Development when GODEX_BUILD_ENV is not set", () => {
		expect(EnvVars.current).toBe(Env.Dev);
	});

	test("isDev returns true in development mode", () => {
		expect(EnvVars.isDev).toBe(true);
	});

	test("isProd returns false in development mode", () => {
		expect(EnvVars.isProd).toBe(false);
	});

	test("current returns correct enum values", () => {
		expect(Env.Dev as string).toBe("dev");
		expect(Env.Prod as string).toBe("prod");
	});
});
