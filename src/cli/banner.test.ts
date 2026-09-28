import { describe, expect, test } from "bun:test";
import { GODEX_BRAND_NAME } from "../version";
import { formatStartupBanner } from "./banner";

describe("formatStartupBanner", () => {
	test("renders sqlite session path when configured", () => {
		const banner = formatStartupBanner({
			version: "0.0.0-test",
			env: "test",
			host: "127.0.0.1",
			port: 13145,
			configPath: "godex.yaml",
			session: {
				backend: "sqlite",
				sqlite: { path: "./data/sessions.db" },
			},
			providers: ["deepseek", "zhipu"],
		});

		expect(banner).toContain(`${GODEX_BRAND_NAME} v0.0.0-test`);
		expect(banner).toContain("address:   http://127.0.0.1:13145");
		expect(banner).toContain("providers: deepseek, zhipu");
		expect(banner).toContain("session:   sqlite (./data/sessions.db)");
	});
});
