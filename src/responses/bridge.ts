import type { ResponsesContext } from "../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../protocol/openai/responses";

export interface ResponsesBridge {
	request(ctx: ResponsesContext): Promise<ResponseObject>;
	stream(ctx: ResponsesContext): Promise<ReadableStream<ResponseStreamEvent>>;
}
