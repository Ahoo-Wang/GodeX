import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as clack from "@clack/prompts";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek/provider";
import { promptInitConfig } from "./prompts";

afterEach(() => {
	mock.restore();
});

describe("promptInitConfig", () => {
	test("returns null when provider selection is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "multiselect").mockResolvedValue(cancelToken as never);
		spyOn(clack, "isCancel").mockImplementation(
			(value): value is symbol => value === cancelToken,
		);

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("rejects invalid port input before returning config", async () => {
		const textAnswers = ["deepseek-key", "not-a-port"];
		const selectAnswers = [DEFAULT_DEEPSEEK_BASE_URL, "memory", "info"];
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "multiselect").mockResolvedValue([DEEPSEEK_PROVIDER_NAME]);
		spyOn(clack, "text").mockImplementation(
			async () => textAnswers.shift() ?? "",
		);
		spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Invalid port: not-a-port");
	});
});
