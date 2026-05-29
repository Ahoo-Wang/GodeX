import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as clack from "@clack/prompts";
import { CONFIG_SEARCH_PATHS } from "../../config";
import {
	DEEPSEEK_PROVIDER_NAME,
	DEFAULT_DEEPSEEK_BASE_URL,
} from "../../providers/deepseek";
import {
	ZHIPU_CODING_PLAN_BASE_URL,
	ZHIPU_PROVIDER_NAME,
} from "../../providers/zhipu";
import { promptConfigPath, promptInitConfig } from "./prompts";

afterEach(() => {
	mock.restore();
});

describe("promptInitConfig", () => {
	function stubPromptFlow(opts: {
		selectedProviders?: unknown;
		textAnswers?: unknown[];
		selectAnswers?: unknown[];
		cancelToken?: symbol;
	}) {
		const textAnswers = [...(opts.textAnswers ?? [])];
		const selectAnswers = [...(opts.selectAnswers ?? [])];
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});

		spyOn(clack, "intro").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(value): value is symbol =>
				opts.cancelToken !== undefined && value === opts.cancelToken,
		);
		spyOn(clack, "multiselect").mockResolvedValue(
			(opts.selectedProviders ?? [DEEPSEEK_PROVIDER_NAME]) as never,
		);
		const text = spyOn(clack, "text").mockImplementation(
			async () => (textAnswers.shift() ?? "") as never,
		);
		const select = spyOn(clack, "select").mockImplementation(
			async () => (selectAnswers.shift() ?? "") as never,
		);

		return { cancel, select, text };
	}

	test("returns config for one provider without prompting for default provider", async () => {
		const { select } = stubPromptFlow({
			selectedProviders: [DEEPSEEK_PROVIDER_NAME],
			textAnswers: ["deepseek-key", "5678"],
			selectAnswers: [DEFAULT_DEEPSEEK_BASE_URL, "memory", "info"],
		});

		const config = await promptInitConfig();

		expect(config).toEqual({
			defaultProvider: DEEPSEEK_PROVIDER_NAME,
			providers: [
				{
					id: DEEPSEEK_PROVIDER_NAME,
					apiKey: "deepseek-key",
					baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
				},
			],
			port: 5678,
			sessionBackend: "memory",
			logLevel: "info",
		});
		const selectMessages = select.mock.calls.map(
			([options]) => (options as { message?: string }).message,
		);
		expect(selectMessages).not.toContain("Default provider:");
	});

	test("returns config for multiple providers with the selected default provider", async () => {
		stubPromptFlow({
			selectedProviders: [DEEPSEEK_PROVIDER_NAME, ZHIPU_PROVIDER_NAME],
			textAnswers: ["deepseek-key", "zhipu-key", "6789"],
			selectAnswers: [
				DEFAULT_DEEPSEEK_BASE_URL,
				ZHIPU_CODING_PLAN_BASE_URL,
				ZHIPU_PROVIDER_NAME,
				"memory",
				"debug",
			],
		});

		const config = await promptInitConfig();

		expect(config).toEqual({
			defaultProvider: ZHIPU_PROVIDER_NAME,
			providers: [
				{
					id: DEEPSEEK_PROVIDER_NAME,
					apiKey: "deepseek-key",
					baseUrl: DEFAULT_DEEPSEEK_BASE_URL,
				},
				{
					id: ZHIPU_PROVIDER_NAME,
					apiKey: "zhipu-key",
					baseUrl: ZHIPU_CODING_PLAN_BASE_URL,
				},
			],
			port: 6789,
			sessionBackend: "memory",
			logLevel: "debug",
		});
	});

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

	test("returns null when no selected provider can be configured", async () => {
		const { cancel } = stubPromptFlow({
			selectedProviders: ["unknown-provider"],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when API key input is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			textAnswers: [cancelToken],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when base URL selection is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			textAnswers: ["deepseek-key"],
			selectAnswers: [cancelToken],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when default provider selection is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			selectedProviders: [DEEPSEEK_PROVIDER_NAME, ZHIPU_PROVIDER_NAME],
			textAnswers: ["deepseek-key", "zhipu-key"],
			selectAnswers: [
				DEFAULT_DEEPSEEK_BASE_URL,
				ZHIPU_CODING_PLAN_BASE_URL,
				cancelToken,
			],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when port input is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			textAnswers: ["deepseek-key", cancelToken],
			selectAnswers: [DEFAULT_DEEPSEEK_BASE_URL],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when session backend selection is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			textAnswers: ["deepseek-key", "5678"],
			selectAnswers: [DEFAULT_DEEPSEEK_BASE_URL, cancelToken],
		});

		const config = await promptInitConfig();

		expect(config).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});

	test("returns null when log level selection is cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const { cancel } = stubPromptFlow({
			cancelToken,
			textAnswers: ["deepseek-key", "5678"],
			selectAnswers: [DEFAULT_DEEPSEEK_BASE_URL, "memory", cancelToken],
		});

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

describe("promptConfigPath", () => {
	afterEach(() => {
		mock.restore();
	});

	test("returns home config path by default", async () => {
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "select").mockResolvedValue(CONFIG_SEARCH_PATHS[1] as never);

		const path = await promptConfigPath();
		expect(path).toBe(CONFIG_SEARCH_PATHS[1]);
	});

	test("returns local config path when selected", async () => {
		spyOn(clack, "isCancel").mockImplementation(
			(_value): _value is symbol => false,
		);
		spyOn(clack, "select").mockResolvedValue(CONFIG_SEARCH_PATHS[0] as never);

		const path = await promptConfigPath();
		expect(path).toBe(CONFIG_SEARCH_PATHS[0]);
	});

	test("returns null when cancelled", async () => {
		const cancelToken = Symbol("cancel");
		const cancel = spyOn(clack, "cancel").mockImplementation(() => {});
		spyOn(clack, "isCancel").mockImplementation(
			(value): value is symbol => value === cancelToken,
		);
		spyOn(clack, "select").mockResolvedValue(cancelToken as never);

		const path = await promptConfigPath();
		expect(path).toBeNull();
		expect(cancel).toHaveBeenCalledWith("Operation cancelled");
	});
});
