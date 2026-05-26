import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";
import type { ResponsesContext } from "../../context/responses-context";
import type {
	ResponseObject,
	ResponseStreamEvent,
} from "../../protocol/openai/responses";

export interface RequestMapper<TReq> {
	map(ctx: ResponsesContext): TReq | Promise<TReq>;
}

export interface ResponseMapper<TRes> {
	map(
		ctx: ResponsesContext,
		result: TRes,
	): ResponseObject | Promise<ResponseObject>;
}

export interface StreamMapper<TChunk> {
	map(
		ctx: ResponsesContext,
		event: JsonServerSentEvent<TChunk>,
	): ResponseStreamEvent[] | Promise<ResponseStreamEvent[]>;
}
