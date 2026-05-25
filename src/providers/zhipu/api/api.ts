import { chatApi } from "../../shared/chat-api";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "../protocol/completions";

export const zhipuApi = chatApi<
	ChatCompletionTextRequest,
	ChatCompletionResponse,
	ChatCompletionChunk
>;
