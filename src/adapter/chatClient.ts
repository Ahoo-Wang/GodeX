import type { JsonServerSentEvent } from "@ahoo-wang/fetcher-eventstream";

export interface ChatClient<TReq, TRes, TChunk> {
	chat(body: TReq): Promise<TRes>;

	streamChat(body: TReq): Promise<ReadableStream<JsonServerSentEvent<TChunk>>>;
}
