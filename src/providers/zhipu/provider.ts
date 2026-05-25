import type { Provider } from "../../adapter/provider";
import type {
	ChatCompletionChunk,
	ChatCompletionResponse,
	ChatCompletionTextRequest,
} from "./protocol/completions";
import { ZhipuClient } from "./provider-client";
import { buildZhipuRequest } from "./request";
import { buildResponseObject } from "./response";
import { ZhipuStreamMapper } from "./stream";

/** Standard Zhipu API base URL. */
export const ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";

export const ZHIPU_CODING_PLAN_BASE_URL =
	"https://open.bigmodel.cn/api/coding/paas/v4";

/** Default base URL (Coding Plan). */
export const DEFAULT_ZHIPU_BASE_URL = ZHIPU_CODING_PLAN_BASE_URL;

export const ZHIPU_PROVIDER_NAME = "zhipu";

export class ZhipuProvider
	implements
		Provider<
			ChatCompletionTextRequest,
			ChatCompletionResponse,
			ChatCompletionChunk
		>
{
	readonly name = ZHIPU_PROVIDER_NAME;
	readonly mapper = {
		request: { map: buildZhipuRequest },
		response: { map: buildResponseObject },
		stream: new ZhipuStreamMapper(),
	};
	readonly client: ZhipuClient;

	constructor(baseURL: string, apiKey: string, timeout?: number) {
		this.client = new ZhipuClient(baseURL, apiKey, timeout);
	}
}
