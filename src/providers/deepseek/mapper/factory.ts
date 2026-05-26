import type { ProviderMapper } from "../../../adapter/provider";
import { createOpenAIMapper } from "../../openai/mapper";
import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionRequest,
} from "../protocol/completions";

export function createDeepSeekMapper(): ProviderMapper<
	ChatCompletionRequest,
	ChatCompletion,
	ChatCompletionChunk
> {
	return createOpenAIMapper() as unknown as ProviderMapper<
		ChatCompletionRequest,
		ChatCompletion,
		ChatCompletionChunk
	>;
}
