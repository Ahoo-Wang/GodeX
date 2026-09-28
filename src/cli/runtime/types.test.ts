import { describe, expect, test } from "bun:test";
import type { ServerDeps } from "../../server";
import type { CliRuntime } from "./types";

describe("CliRuntime", () => {
	test("preserves the optional server stop handle from runtime injections", () => {
		const runtime: CliRuntime = {
			startServer: () => ({
				port: 3000,
				stop: () => {},
			}),
		};

		const handle = runtime.startServer?.({} as ServerDeps);
		handle?.stop?.();

		expect(handle?.port).toBe(3000);
	});
});
