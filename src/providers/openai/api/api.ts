import type {
	ChatCompletion,
	ChatCompletionChunk,
	ChatCompletionCreateRequest,
} from "../../../protocol/openai/completions";
import { chatApi } from "../../shared/chat-api";

export const openAIChatApi = chatApi<
	ChatCompletionCreateRequest,
	ChatCompletion,
	ChatCompletionChunk
>;
