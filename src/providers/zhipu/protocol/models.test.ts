import { describe, expect, test } from "bun:test";
import { ZHIPU_DEFAULT_MODEL } from "../spec";
import {
	TEXT_MODELS,
	THINKING_FORCE_MODELS,
	TOOL_STREAM_MODELS,
} from "./models";

describe("Zhipu model catalog", () => {
	// The provider's typed DTOs (e.g. ChatCompletionTextRequest.model: TextModel)
	// are derived from these lists, so the default model must be a member of them
	// or the catalog can no longer represent its own default.
	test("default model is part of the text catalog and capability lists", () => {
		expect(TEXT_MODELS).toContain(ZHIPU_DEFAULT_MODEL);
		expect(THINKING_FORCE_MODELS).toContain(ZHIPU_DEFAULT_MODEL);
		expect(TOOL_STREAM_MODELS).toContain(ZHIPU_DEFAULT_MODEL);
	});
});
